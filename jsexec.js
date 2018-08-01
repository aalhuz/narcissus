/* ***** BEGIN LICENSE BLOCK *****
 * vim: set ts=4 sw=4 et tw=80:
 *
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Narcissus JavaScript engine.
 *
 * The Initial Developer of the Original Code is
 * Brendan Eich <brendan@mozilla.org>.
 * Portions created by the Initial Developer are Copyright (C) 2004
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Narcissus - JS implemented in JS.
 *
 * Execution of parse trees.
 *
 * Standard classes except for eval, Function, Array, and String are borrowed
 * from the host JS environment.  Function is metacircular.  Array and String
 * are reflected via wrapping the corresponding native constructor and adding
 * an extra level of prototype-based delegation.
 */

const GLOBAL_CODE = 0, EVAL_CODE = 1, FUNCTION_CODE = 2;

// this global helps to match conditions within a paranthesis
// x == 9 && (t1 == 10 || t1 == 11 || t1 == 12)
// the three caluses in the last AND clause should be combined first
// t1 == 10 : true
// NOT(t1 == 10) AND t1 == 11 : true
// NOT(t1 == 10) AND NOT (t1 == 11) AND t1 == 12 : true
// NOT(t1 == 10) AND NOT (t1 == 11) AND NOT(t1 == 12): false
// and then combine these true/false with the AND conditions
var clauseCounter = 0;

var NT_execution_started = false; 
var NT_execution_ended = false; 


function ExecutionContext(type) {
    p("execution context - " + type);
    this.type = type;
    this.programCondition = "true"; 
    this.nextInstruction =  null;
    this.notamper_index = null;
    this.calledExecutionContext_result = null;
    this.calledExecutionContext_programCondition = "";
}

var global = {
    // Value properties.
    NaN: NaN, Infinity: Infinity, undefined: undefined,

    // Function properties.
    eval: function eval(s) {
        if (typeof s != "string")
            return s;
        
        p(" Eval called : " + s);
        
        var x = ExecutionContext.current;
        var x2 = new ExecutionContext(EVAL_CODE);
        x2.thisObject = x.thisObject;
        x2.caller = x.caller;
        x2.callee = x.callee;
        x2.scope = x.scope;
        ExecutionContext.current = x2;
        try {
            execute(parse(s), x2);
        } catch (e if e == THROW) {
            x.result = x2.result;
            throw e;
        } finally {
            ExecutionContext.current = x;
        }
        return x2.result;
    },
    parseInt: parseInt, parseFloat: parseFloat,
    isNaN: isNaN, isFinite: isFinite,
    decodeURI: decodeURI, encodeURI: encodeURI,
    decodeURIComponent: decodeURIComponent,
    encodeURIComponent: encodeURIComponent,

    // Class constructors.  Where ECMA-262 requires C.length == 1, we declare
    // a dummy formal parameter.
    Object: Object,
    Function: function Function(dummy) {
        p(" Function : called : " + dummy);
            
        var p = "", b = "", n = arguments.length;
        if (n) {
            var m = n - 1;
            if (m) {
                p += arguments[0];
                for (var k = 1; k < m; k++)
                    p += "," + arguments[k];
            }
            b += arguments[m];
        }

        // XXX We want to pass a good file and line to the tokenizer.
        // Note the anonymous name to maintain parity with Spidermonkey.
        var t = new Tokenizer("anonymous(" + p + ") {" + b + "}");

        // NB: Use the STATEMENT_FORM constant since we don't want to push this
        // function onto the null compilation context.
        var f = FunctionDefinition(t, null, false, STATEMENT_FORM);
        var s = {object: global, parent: null};
        return new FunctionObject(f, s);
    },
    Array: function Array(dummy) {
    //  p(" Array Constructor : called : " + dummy);

        // Array when called as a function acts as a constructor.
        return GLOBAL.Array.apply(this, arguments);
    },
    String: function String(s) {
    //p(" String Constructor : called : " + s);
        // Called as function or constructor: convert argument to string type.
        s = arguments.length ? "" + s : "";
        if (this instanceof String) {
            // Called as constructor: save the argument as the string value
            // of this String object and return this object.
            this.value = s;
            return this;
        }
        return s;
    },
    Boolean: Boolean, Number: Number, Date: Date, RegExp: RegExp,
    Error: Error, EvalError: EvalError, RangeError: RangeError,
    ReferenceError: ReferenceError, SyntaxError: SyntaxError,
    TypeError: TypeError, URIError: URIError,

    // Other properties.
    Math: Math,    

    // Extensions to ECMA.
    snarf: snarf, evaluate: evaluate,
    load: function load(s) {

        if (typeof s != "string")
            return s;
     //   p(" load called  : " + s);

        evaluate(snarf(s), s, 1)
    },
    print: print, version: null, 
};

// Helper to avoid Object.prototype.hasOwnProperty polluting scope objects.
function hasDirectProperty(o, p) {
    //print("hasDirectProperty"); 
    //p (" \t\t object - " + o + " property - " + p);
    return Object.prototype.hasOwnProperty.call(o, p);
}

/* Abeer I changed this method and added the next
// Reflect a host class into the target global environment by delegation.
function reflectClass(name, proto) {
    //p ( " reflect class "); 
    //p ("\t\t name - " + name + " proto - " + proto);
    
    var gctor = global[name];
    gctor.__defineProperty__('prototype', proto, true, true, true);
    proto.__defineProperty__('constructor', gctor, false, false, true);
    return proto;
}

*/
function reflectClass(name, proto) {
    var gctor = global[name];
    gctor.prototype = proto;
    proto.constructor = gctor;
    return proto;
}

// Reflect Array -- note that all Array methods are generic.
reflectClass('Array', new Array);

// Reflect String, overriding non-generic methods.
var gSp = reflectClass('String', new String);
gSp.toSource = function () { return this.value.toSource(); };
gSp.toString = function () { return this.value; };
gSp.valueOf  = function () { return this.value; };
global.String.fromCharCode = String.fromCharCode;

var XCp = ExecutionContext.prototype;
ExecutionContext.current = XCp.caller = XCp.callee = null;
XCp.scope = {object: global, parent: null};
XCp.thisObject = global;
XCp.result = undefined;
XCp.target = null;
XCp.ecmaStrictMode = false;

p ( " Execution context definition"); p ( " \t \t " + XCp);

function Reference(base, propertyName, node) {
    this.base = base;
    this.propertyName = propertyName;
    this.notamper_symbolic = false; 
    this.node = node;
    
//    p( " Reference () ");
//    p( " \t \t property - " + propertyName  + " node - " + node);
}

Reference.prototype.toString = function () { return this.node.getSource() + " Symbolic - " + this.notamper_symbolic; }

function notamper_getPropertyName(s)
{
    return s + "_notamper_symbolic";
}

function getValue(v) {

    var retValue = null;
    if (v instanceof Reference) {
        if (!v.base) {
            throw new ReferenceError(v.propertyName + " is not defined",
                                     v.node.filename, v.node.lineno);
        }
        p ("getValue: ");
        p ( "\t\t return 1 - " + v.base[v.propertyName] + " property - " + v.propertyName  + " and symbolic - " + (v.base)[notamper_getPropertyName(v.propertyName)]);
        // return v.base[v.propertyName];
        retValue = v.base[v.propertyName];
    }
    else
    {
        retValue  = v; 
    }
    
    if ( retValue != null && (typeof retValue == "string") && 
        retValue.substring("_notamper_symbolic") != -1)
    {
        if(v.propertyName != undefined){
		    p(" setting property - " + v.propertyName + " to be symbolic"); 
            (v.base || global) [notamper_getPropertyName(v.propertyName)] = true;
        }    
    }
    
    p (" getValue returns- " + retValue);
    return retValue;
}

function putValue(v, w, vn) {
        //p(" putValue");
        //p("checkout put value \t\t : " + v + " property name "+ v.propertyName + " w = " + w + " file - " + v.node.filename  + " line - " + v.node.lineno);

    if (v instanceof Reference)
    {
//        if(v.base != null)
//        {
//         for (var i = 0; i < v.base.length ; i++)
//            p (" \t \t - item " + i + " value - " + v.base[i]);
//        }

//        if( (typeof w) == "string" && w.substring("_notamper_symbolic") != -1)
//            (v.base || global) [notamper_getPropertyName(v.propertyName)] = true;
    
//        p ( " \t\t\t v.base = " + v.base + " global - " + global + 
//            " v.propertyName - " + v.propertyName + " w -  " + w +  " and type - " + w.type + 
//            " global[email1_notamper_symbolic] = " + 
//            (v.base || global)[notamper_getPropertyName(v.propertyName)]);
        return (v.base || global)[v.propertyName] = w;
    }
    throw new ReferenceError("Invalid assignment left-hand side",
                             vn.filename, vn.lineno);
}

function isPrimitive(v) {
    //p ( " isPrimitive \n \t\t " + v );
    var t = typeof v;
    return (t == "object") ? v === null : t != "function";
}

function isObject(v) {
    var t = typeof v;
    return (t == "object") ? v !== null : t == "function";
}

// If r instanceof Reference, v == getValue(r); else v === r.  If passed, rn
// is the node whose execute result was r.
function toObject(v, r, rn) {
    switch (typeof v) {
      case "boolean":
        return new global.Boolean(v);
      case "number":
        return new global.Number(v);
      case "string":
        return new global.String(v);
      case "function":
        return v;
      case "object":
        if (v !== null)
            return v;
    }
    if ( NT_execution_started == true){
        var message = r + " (type " + (typeof v) + ") has no properties";
        throw rn ? new TypeError(message, rn.filename, rn.lineno)
             : new TypeError(message);
    }
    else{
        return v; 
    }
}

function getNodeType ( n )
{
    if ( n != null)
        return tokenstr ( n.type );
    else
        return "null";
} 

function setNextInstruction ( currentInstruction, nextInstruction )
{
    // as BLOCKs are recursively executed, setNextInstruction does not recurse
    // for all instructions if current stmt is a BLOCK itself. instead it traverses
    // to the last instruction in current block and recurses there. In turn when 
    // BLOCKs are visited recursively, setNextInstruction is not invoked for 
    // instructions apart from the last.  
    var ctype = currentInstruction.type;
    if ( ctype == BLOCK )
    {
        var lastInstruction = currentInstruction[currentInstruction.length - 1];
        setNextInstruction (lastInstruction, nextInstruction);
    }
    else if (ctype == IF)
    {
        // if condition guard is symbolically executed both then/else parts are
        // to be executed. it is recorded in the pendingExecutionContexts. 
        setNextInstruction (currentInstruction.thenPart, nextInstruction);
        if (currentInstruction.elsePart != null){
            setNextInstruction (currentInstruction.elsePart, nextInstruction);
    	} else { 
    	// Prithvi : debug this 
    	    currentInstruction.nextInstruction = nextInstruction; 
    	}
		//else { 
		//	currentInstruction.elsePart = new Object(); 
		//	setNextInstruction (currentInstruction.elsePart, nextInstruction);
		//}
	}
    else
    {
        // otherwise current instruction is a simple instruction
        currentInstruction.nextInstruction = nextInstruction;
    }
}

function updatePC(xc, condition)
{
    p ( " updatePC  - " + xc.programCondition + " condition = " + condition );
    if ( "" + xc.programCondition == "true")
    {
        xc.programCondition = "" + condition ; 
    }
    else
    {
        xc.programCondition = " AND ( " + xc.programCondition + " ) (" + 
            condition + " ) " ; 
    }
}

function die_with_message ( msg )
{
    // whats an elegant way to exit from a standalone js ? 
    var m = " FATAL MESSAGE : " + msg; 
    p ( m.toUpperCase () );
    throw new TypeError(m);
}


//            forkSymbolicExecution ( n[i] , n[i].initializer , x, n.nextInstruction, n.type);     

// lval = rval ; in execution context x
function forkSymbolicExecution ( lval, rval, x, nNext, nType)
{
    if ( nNext == null)
        p ( " forkSymbolicExecution called with null next instruction. " + 
            "\n \t  lval - " + lval + " rval - " + rval); 
    //die_with_message(" fork symb called with lval - " + lval + " rval - " + rval + " nNext - " + nNext);

    var u = rval;   
    if (!u)
        return;
        
    var t = lval;
    for (var s = x.scope; s; s = s.parent) {
        if (hasDirectProperty(s.object, t))
            break;
    }
    
    var u1 = getValue(execute(u, x));
    if ( u.type == CALL )
    {
        var xpr = x.calledExecutionContext_result;
        xpr = (xpr == null ? u1 : xpr);
        var xpc = x.calledExecutionContext_programCondition;
        //p ( " var initialization - " + t + " called ret = " + xpr +
        //    " pc = " + x.calledExecutionContext_programCondition);

        // if called function's program condition is not true, it executed 
        // symbolically. lval must receive values corresponding to all return
        // records of the called function. notamper stores all but one return 
        // record alongwith its execution context to execute later.   
        if ( xpc != "true" )
        {
            fn = u[0].value; 
       
            var actuals = [];     
            var args = u[1]; 
            if ( args.type == LIST )
            {
                pv ( " \t arguments - " + args.length);
                for (i1 = 0, j1 = args.length; i1 < j1; i1++) 
                {
                    value = execute(args[i1], x);
                    a1 = getValue(value);
                    pv ( " \t \t actual - " + a1);
                    actuals[i1] = a1;
                }
            }
            
            allReturnRecords = findReturnRecords( fn, ReturnRecords, actuals);
            //var rrlen = allReturnRecords.length;
            // printReturnRecords ( allReturnRecords );
            var itmp = 0; 
            var count = allReturnRecords.getCount();
            for ( itmp = 0; itmp < count ; itmp++)
            {
                var mem = allReturnRecords.getAt( itmp );
//                p ( "  record #" + mem.index + " \t funcName : " + 
//                    mem.funcName + " \t returns = |" + mem.retValue + 
//                    "| \t pc = |" + mem.condition + "|" + " typeof return - " + (typeof mem.retValue) + " typeof pc - " + (typeof mem.condition));
//                p ( " matching against - returns = |" + xpr + "|\t pc - |" + xpc + "|" + " typeof ret - " + 
//                    (typeof xpr) + " typeof pc - " + (typeof xpc));

                // convert all objects to string type for comparison                    
                if ( (("" + mem.condition) == ("" + xpc)) && (("" + xpr) == ("" + mem.retValue)))
                {
//                            p ( " skipping: " + " record#" + mem.index + " fn - " + 
//                                mem.funcName + " ret - " + mem.retValue + " pc - " + mem.condition);
//                            if (n.type == CONST)
//                                s.object.__defineProperty__(t, xpr, x.type != EVAL_CODE, true);
//                            else
//                                s.object[t] = xpr;
//                            x.programCondition += " AND " + mem.condition; 
                }
                else
                {
                    pv ( " next instruction to execute - " + nNext);
                    if (nType == CONST)
                        s.object.__defineProperty__(t, mem.retValue, x.type != EVAL_CODE, true);
                    else
                        s.object[t] = mem.retValue;
//print("clone 1");
                    xcSaved = cloneObject ( x, 0 );

                    updatePC(xcSaved, mem.condition);
                    xcSaved.nextInstruction = nNext;
                    
                    xcSaved.notamper_index = RRIndex++;
                    xcSaved.funcName = x.callee.node.name;
                    p ( " FORKED: adding a pending execution after var init " + t + " notamper_index - " + 
                        xcSaved.notamper_index + " return value - " + mem.retValue + " next - " + nNext); 
                    PendingExecutions.add( xcSaved );
                    printPendingExecutions( PendingExecutions ); 
                    pv ( " reset the local var - " + xpr);
                    if (nType == CONST)
                        s.object.__defineProperty__(t, xpr, x.type != EVAL_CODE, true);
                    else
                        s.object[t] = xpr;    
                
                }    
            }
            for ( itmp = 0; itmp < count ; itmp++)
            {
                var mem = allReturnRecords.getAt( itmp );
                if ( (("" + mem.condition) == ("" + xpc)) && (("" + xpr) == ("" + mem.retValue)))
                {
                    p ( " skipping: " + " record#" + mem.index + " fn - " + 
                        mem.funcName + " ret - " + mem.retValue + " pc - " + mem.condition);
                    if (nType == CONST)
                        s.object.__defineProperty__(t, xpr, x.type != EVAL_CODE, true);
                    else
                        s.object[t] = xpr;
                        
                    updatePC(x, mem.condition);   
                }
            }

        }
    }
   // p ( " here : s - " + s + " t - " + t + " u1 = " + u1);
    
    if(s != null){
		if (nType == CONST)
            s.object.__defineProperty__(t, u1, x.type != EVAL_CODE, true);
        else
            s.object[t] = u1;
    }

    return u1;
}


function executeBinaryOperator(n, x)
{
    var v1 = getValue(execute(n[0], x));
    var v2 = getValue(execute(n[1], x));
    if (isSymbolic(v1) || isSymbolic(v2))
    {
        var v1Quotes = (n[0].type == STRING) ? "\"" : "";
        var v2Quotes = (n[1].type == STRING) ? "\"" : "";        
                    
        var v1Q = v1Quotes + v1 + v1Quotes;
        var v2Q = v2Quotes + v2 + v2Quotes;

/*
        if (isSymbolic (v1))
            v1Q = " var \"" + v1Q + "\""; 
              
        if (isSymbolic (v2))
            v2Q = " var \"" + v2Q + "\"";            
*/
        var trueCondition = v1Q;
        var tmp = v2Q;

        // symbolic execution 
        switch (n.type)
        {
//            case NE: trueCondition += " != " + v2; break; 
//            case EQ: trueCondition += " == " + v2; break;
//            case STRICT_EQ: trueCondition += " == " + v2; break;           
//            case STRICT_NE: trueCondition += " != " + v2; break;
//            case LT: trueCondition += " < " + v2; break;
//            case LE: trueCondition += " <= " + v2; break;
//            case GE: trueCondition += " >= " + v2; break;
//            case GT: trueCondition += " > " + v2; break;
//            case PLUS: trueCondition += " + " + v2; break;
//            case MINUS: trueCondition += " - " + v2; break;
//            case MUL: trueCondition += " * " + v2; break;
//            case DIV: trueCondition += " / " + v2; break;
//            case MOD: trueCondition += " % " + v2; break;
            case EQ: 
            case STRICT_EQ: trueCondition = "= " + trueCondition + " " + tmp; break;

            case NE:  
            case STRICT_NE: trueCondition = "!= " + trueCondition + " " + tmp; break;
            
            case LT: trueCondition = "< "+ trueCondition + " "  + tmp; break;
            case LE: trueCondition = "LTE " + trueCondition + " " + tmp; break;
            case GE: trueCondition = "GTE " + trueCondition + " " +  tmp; break;
            case GT: trueCondition = "> " + trueCondition + " " + tmp; break;
            case PLUS: trueCondition = "+ " + trueCondition + " " + tmp; break;
            case MINUS: trueCondition = "- " + trueCondition + " " + tmp; break;
            case MUL: trueCondition = "* " + trueCondition + " " + tmp; break;
            case DIV: trueCondition = "/ " + trueCondition + " " + tmp; break;
            case MOD: trueCondition = "% " + trueCondition + " " + tmp; break;

            default : 
            die_with_message ("unhandled symbolic execution of binary operator - n[0] " + 
                n[0] + " n[1] - " + n[1]);
        }       
        
        if (n.type != PLUS || n.type != MINUS || n.type != MUL ||
            n.type != DIV || n.type != MOD)
        {
            //var falseCondition = " NOT ( " + trueCondition + " ) ";
            conditionCases.add(new ConditionRecord(conditionIndex++, true, trueCondition));
            //conditionCases.add(new ConditionRecord(conditionIndex++, false, falseCondition));
        }

        v = trueCondition;
    }
    else
    {
        // concrete execution : 
        switch(n.type)
        {
            case NE: v =  v1 != v2; break;
            case EQ: v = v1 == v2; break;
            case STRICT_EQ: v = v1 === v2; break;
            case STRICT_NE: v = v1 !== v2; break;
            case LT: v = v1 < v2; break;
            case LE: v = v1 <= v2; break;
            case GE: v = v1 >= v2; break;
            case GT: v = v1 > v2; break;
            case PLUS: v = v1 + v2; break;
            case MINUS: v = v1 - v2; break;
            case MUL: v = v1 * v2; break;
            case DIV: v = v1 / v2; break;
            case MOD: v = v1 % v2; break;
            
            default : 
            die_with_message ("unhandled concrete execution of binary operator - n[0] " + 
                n[0] + " n[1] - " + n[1]);
        }
    }
    
    return v; 
}


function getNonFalsePC(pc1, pc2)
{
    // check if pc1 is the negation of pc2 or vice-versa.
    var pc1Negation = "NOT (" + pc1 + ")";
    var pc2Negation = " NOT (" + pc2 + ")"; 
    var sub1 = pc1.indexOf(pc2Negation);
    var sub2 = pc2.indexOf(pc1Negation);
    var sub3 = pc1.indexOf(pc2);
    
    pv(" indices  sub1 = " + sub1 + " sub2 = " + sub2 + " sub3 = " + sub3);
    if(! (sub1 == -1 && sub2 == -1 && sub3 == -1))
        return null;

    return (pc1 + " AND " + pc2);
}

function enumeratePossiblePathConditions(n, x, bOR)
{
    ++clauseCounter;
    var strNodeType = bOR ? "OR": "AND";  
    pv ( strNodeType + " Debug - n[0] - " + n[0]);
    pv ( strNodeType + " Debug - n[1] - " + n[1]);
    var vlClause = getValue (execute(n[0], x));
    
    addRecordIfAbsent( vlClause, conditionCases );
    
    pv ( " value of vlClause - " + vlClause);
       
    var vrClause = getValue (execute(n[1], x));
    addRecordIfAbsent (vrClause, conditionCases);
    var symb = false; 
    if (isSymbolic(vlClause) || isSymbolic(vrClause))
    {
        p ( " Condition Record before processing - " ); printConditionRecords(conditionCases);

        // copy the current true records to new collection of conditions
        var newConditions = new DP_ObCollectionOrdered("index", ReturnRecord);             
        var tConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 
        var fConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 

        var j = 0; 
        var jc = conditionCases.getCount ();
        var mem = null;
        var memF = null; 
        
        // first condition case w/ false results
        // there is only one condition in case of ORs.
        for ( ; j < jc ; j++)
        {
            mem = conditionCases.getAt(j);
            p ( " now processing - " + mem.condition);
            // do not process the clause conditions that do not belong 
            // to this level here 
            if(mem.nestingDepth != clauseCounter)
            {
                newConditions.add(mem);
                continue; 
            }

            if (mem.boolValue)
            {   
                if(bOR)
                {                 
                    // PC conditions that lead to true values
                    // are short-circuited in ORs. 
                    bRet = mem.condition; 
                    var newcond = new ConditionRecord(conditionIndex++, mem.boolValue, mem.condition);
                    newcond.processed = false; 
                    newConditions.add(newcond);
                    tConditions.add(newcond);
                    p  (" adding to true conditions - " + newcond.condition + " " + newcond.boolValue);
                }
                else
                {
                    p  (" adding to true conditions - " + mem.condition + " " + mem.boolValue);
                    tConditions.add(mem);
                }
            }
            else
            {
                if(!bOR)
                {                 
                    // PC conditions that lead to false values
                    // are short-circuited in ANDs. 
                    bRet = mem.condition; 
                    var newcond = new ConditionRecord(conditionIndex++, mem.boolValue, mem.condition);
                    newcond.processed = false;
                    p  (" adding to false conditions - " + newcond.condition + " " + newcond.boolValue);
                    newConditions.add(newcond);
                    fConditions.add(newcond);
                }
                else
                {
                    p  (" adding to false conditions - " + mem.condition + " " + mem.boolValue);
                    fConditions.add(mem);
                }
            }
        }
        
        var cond1 = null;
        var cond2 = null;
        if(bOR)
        { 
            cond1 = fConditions; cond2 = tConditions;    
        }
        else
        { 
            cond1 = tConditions; cond2 = fConditions;    
        }
        
        var c1Count = cond1.getCount();
        var c2Count = cond2.getCount();
        var onePC = "";

        var i = 0;        
        for ( i = 0; i < c1Count ; i++ )
        {                            
            var mem1 = cond1.getAt(i);
            if(!mem1.processed)
            {
                for(j = 0; j < c2Count ; j++)
                {
                    var mem2 = cond2.getAt(j);
                                           
                    var newpc = getNonFalsePC(mem1.condition, mem2.condition); 
                    if(newpc == null)
                        continue; 
                          
                    var newcond = new ConditionRecord(conditionIndex++, mem2.boolValue, newpc);
                    newcond.processed = true; 
                    newConditions.add(newcond);
                }
            }
                            
            onePC += mem1.condition;
            if(i < c1Count - 1)
                onePC += " AND ";                 
        }
        
        var newcond = new ConditionRecord(conditionIndex++, !bOR, onePC);
        newConditions.add(newcond);
        
        //freeConditionRecords(conditionCases);
        conditionCases = newConditions;

        // now demote the clauses to enclosing nesting depth to allow
        // them to be combined to those clauses
        j = 0; 
        jc = conditionCases.getCount ();
        var inLevel = 0;
        for ( ; j < jc ; j++ )
        {                            
            mem = conditionCases.getAt(j);
            if(mem.nestingDepth != clauseCounter)
                continue; 
            else
            {
                if(mem.boolValue)
                    bRet = mem.condition;
                mem.nestingDepth--;
                mem.processed = true; 
            }
        }

        p ( " Condition Record after processing - " ); printConditionRecords(conditionCases);
    }        
    else
    {
        if(bOR)
        {
            bRet = (vlClause || vrClause);
        }
        else
        {
            bRet = (vlClause && vrClause);
        }
    }
    
    --clauseCounter;                
    return bRet;
}

function execute(n, x) {

    var a, f, i, j, r, s, t, u, v;
//    p ( " execute : called " + n + " and x - " + x );
    p ( " Execute : " + getNodeType (n));
    
    switch (n.type) {
      case FUNCTION:
        //p ( " \t func name " + (n.name ? n.name : "null" ) + "func body - " + n.body);
        
        // this creates a function object. anonymous invocations are defined as a 
        // property of the lvalue whereas regular functions get their own scope. 
        // this scope is embedded in the defining scope.
        // symbolic exec : do we need to do something here? 
        //  - prob not. its not a call. 
        if (n.functionForm != DECLARED_FORM) {
            if (!n.name || n.functionForm == STATEMENT_FORM) {
                v = new FunctionObject(n, x.scope);
                if (n.functionForm == STATEMENT_FORM)
                    x.scope.object.__defineProperty__(n.name, v, true);
            } else {
                t = new Object;
                x.scope = {object: t, parent: x.scope};
                try {
                    v = new FunctionObject(n, x.scope);
                    t.__defineProperty__(n.name, v, true, true);
                } finally {
                    x.scope = x.scope.parent;
                }
            }
        }
        break;

      case SCRIPT:

 t = x.scope.object;
        a = n.funDecls;
        for (i = 0, j = a.length; i < j; i++) {
            s = a[i].name;
            f = new FunctionObject(a[i], x.scope);
            t[s] = f;
        }
        a = n.varDecls;
        for (i = 0, j = a.length; i < j; i++) {
            u = a[i];
            s = u.name;
            if (u.readOnly && hasDirectProperty(t, s)) {
                throw new TypeError("Redeclaration of const " + s,
                                    u.filename(), u.lineno);
            }
            if (u.readOnly || !hasDirectProperty(t, s)) {
                t[s] = null;
            }
        }

        // FALL THROUGH

      case BLOCK:
      
        // this is the highest level where execution starts. 
        // BLOCK stands for a regular PL basic block i.e., function bodies, 
        // scripts to be execed, if-else blocks. 
        // symbolic exec : 
        //  - first step is to give an idea of what has to be execed next. 
        //      for forking symb exec we must know the next instr. 
        //      basically, the way symb exec is achieved here is to 
        //          a. save the exec context ( nested chains of scopes, program condition)
        //          b. set the value of current instr based on diff symb exec branches e.g., 
        //                  x = f(); <- f may return PCondition1 - val1 and PCondition2 - val2.
        //              set x as val1 and append PCondition1 to current program condition.
        //              similarly set x as val2 and append PCondition2 and save it for subsequent execution.
        //              note that by saving execution context, we save the entire environment including 
        //              calling parents. 
        for (i = 0, j = n.length; i < j; i++)
        {
            if ( i + 1 < j )
            {
                // store info of next inst to be executed.
                // if current instruction is a block stmt - then the last stmt
                // points to the next instruction  
                setNextInstruction ( n[i], n[i + 1] );
                //p("\t n[" + i + "] - "  + getNodeType(n[i]) + 
                //    " next instruction - " + getNodeType(n[i].nextInstruction));
            }
            else
            {
                //p("\t n[" + i + "] - "  + getNodeType(n[i]) + 
                //    " next instruction - null");
            }
        }           
        
        for (i = 0, j = n.length; i < j; i++)
        {
            execute(n[i], x);
        }
        break;

      case IF:
                
        // the guard condition may be evaluated symbolically.
        // symb exec : 
        //  - if guard condition is evaluated symbolically, both the then and the
        // else part should be executed. 
        //  - evaluate the guard condition and if its value is symbolic instead of 
        // boolean, keep executing the true branch i.e., the then branch and store
        // else branch for subsequent execution.
        p("IF: processing starts condition : " + n.condition);    
        conditionValue = execute(n.condition, x);    
        p("IF: condition evaluated " + conditionValue);

        var bool2 = isSymbolic(getValue(conditionValue));
		p(" is condition symbolic - " + conditionValue + " - " + bool2);
        if ( isSymbolic ( conditionValue ) || bool2)
        {
        
            if(bool2)
                addRecordIfAbsent( getValue(conditionValue), conditionCases );

            p(" Symbolic execution of if condition : symbolic condition - " + conditionValue);
            //p ( " then part - " + n.thenPart);
            //p ( " else part - " + n.elsePart);
            //p ( " next inst - " + n.nextInstruction);
            printConditionRecords(conditionCases);            
            var i = 0;
            var count = conditionCases.getCount();
            var xcTrue = null;
    
            // all types of if conditions are expressed with two formulas:
            // one that holds for the then path
            // negation of the above that holds for the else path, if any. 
            // if we have more than 1 final formula raise an error 
            if ( count != 1 )
            {
                var bFound = false; 
				if(count > 2)
				{
        			var newConditions = new DP_ObCollectionOrdered("index", ReturnRecord);             
                    var count = conditionCases.getCount();
					var j = 0; 
					for ( ; j < count ; j++)
                    {
                        var mem = conditionCases.getAt(j);
//                        p ( " Condition Case #" + mem.index + 
//                            "    depth: " + mem.nestingDepth +
//                            " val : " + (mem.boolValue ? "T" : "F") + 
//                            " pro - " + (mem.processed ? "T" : "F") +
//                            " pc = " + mem.condition); 
    					var tPc = mem.condition;
						var tPc = tPc.toLowerCase();
						if(tPc.indexOf("or(") != -1 || tPc.indexOf("and(") != -1){
							newConditions.add(mem); 
							bFound = true;
							break;
						}
                    }
                    //freeConditionRecords(conditionCases); 
					conditionCases = newConditions;
				}
				if(bFound == false){
                    p1(TMP_DEBUG, "Internal Error: if stmt condition could not be calculated" + n + 
			 	   	" count - " + count);
                    throw "Internal Error: if stmt condition could not be calculated" + n;
            	}	
			}

            var mem = conditionCases.getAt(0);
            
            // prepare the then part execution context
//print("clone 2");
            var xcThen = cloneObject ( x , 0);
            updatePC(xcThen, mem.condition);
            xcThen.nextInstruction = n.thenPart; 
            xcThen.notamper_index = RRIndex++;
            xcThen.funcName = x.callee.node.name; 

            // prepare the else part execution context
//print("clone 3");
            var xcElse = cloneObject ( x , 0);            
            // updatePC(xcElse, "NOT ( " + mem.condition + " ) ");
//print("clone 3.1");
            updatePC(xcElse, negateThisCondition(mem.condition));
//print("clone 3.2");
            if ( n.elsePart )
                xcElse.nextInstruction = n.elsePart;
            else
            if ( n.nextInstruction )
                xcElse.nextInstruction = n.nextInstruction;
            else{
                var ctype = n.thenPart.type;
                if ( ctype == BLOCK )
                    xcElse.nextInstruction = n.thenPart[n.thenPart.length - 1].nextInstruction;                    
                else
                    xcElse.nextInstruction = n.thenPart[0].nextInstruction;                    
            }
            
            xcElse.funcName = x.callee.node.name;             
            xcElse.notamper_index = RRIndex++;
            
            p ( "FORKED: adding a pending execution notamper_index - " + 
                xcElse.notamper_index + " pc - "  + xcElse.programCondition); 

            PendingExecutions.add( xcElse );                
            printPendingExecutions( PendingExecutions ); 
      
            // reset the conditioncases 
            // conditionIndex should be reset when resetting the 
            // collection of conditions --> generally ifs, assignments, groups, hooks
            // this helps to number the executed conditional clauses left to right
            // a || b || c --> a : 1, b : 2 , c : 3 
            //freeConditionRecords(conditionCases); 
            conditionCases.clear();      
            conditionIndex = 0 ;

            // continue executing the then part         
            x.programCondition = xcThen.programCondition;
            //destroyObject(xcThen); 
            ExecutionContext.current = x;
            execute(n.thenPart, x);     
        }
        else
        {
            // if condition does not involve any symbolic variables, execute it 
            // concretely. Realize that while symbolically executing a piece of code
            // this helps us to evaluate undesired embedded conditionals concretely.
            // undesired here refers to conditionals based on non-form input values / properties. 
            // we are only interested in computation done on form inputs (symbolically initialized
            // in simulated DOM).
            pv (" Concrete execution of if condition");
            if (getValue(conditionValue))
                execute(n.thenPart, x);
            else if (n.elsePart)
                execute(n.elsePart, x);
        }

        break;

      case SWITCH:
      // handling of switch is done as "if-then-else" except that there are 
      // symb exec : numberofcases - 1 pending executions.
        
        var s = getValue(execute(n.discriminant, x));
        var t = n.discriminant.value;
            
        // p ( "  \t n - " + n + "\n\t discriminant - " + n.discriminant + " name - " + t + " value - " + s) ;     

        a = n.cases;
        var matchDefault = false;

        if ( isSymbolic ( s ) && !x.switchCase)
        {
            if (n.discriminant.type != IDENTIFIER)
            {
                die_with_message ( " NoTamper impl currently only allows switch discriminant to be a variable. Please simplify this - " + n.discriminant);
            }
        
            // now we can simply search discriminant identifier in the enclosing scopes. 
            //var t = n.discriminant.value; 
            for (var sc = x.scope; sc; sc = sc.parent) {
                if (hasDirectProperty(sc.object, t))
                    break;
            }
            
            if ( sc == null)
            {
                die_with_message ( " NoTamper impl failed to find the switch discriminant variable. Please simplify this - " + n.discriminant);
            }
            
            for (var i = 0, j = a.length; ;) 
            {
//                p ( " \t next consideration - " + " i - " + i + " j - " + j + " = " + a[i]);
                var t1 = a[i];                       // next case (might be default!)
                if (t1.type == CASE) 
                {                
                    var u = getValue(execute(t1.caseLabel, x)); 
                    // clone the exec context;
                    //p ( " assigning property - " + t + " prop val - " + s + 
                    //    " to assign value - " + u + " type - " + (typeof u));
                    //sc.object[s] = "" + u;
                    sc.object.__defineProperty__(t, u, true);
                    //p ( " scope  after updating the value of disc - "); printScope ( " \t " , sc);
//print("clone 4");
                    var xcSaved = cloneObject ( x, 0 );
                    var pc1 = s + " == " + u;
                    updatePC(xcSaved, pc1);
                    xcSaved.nextInstruction = n;
                    
                    // sc.object[s] = "defaultSave";
                    sc.object.__defineProperty__(t, "defaultValue", true);
                    xcSaved.switchCase = true;             
                    xcSaved.notamper_index = RRIndex++;
                    xcSaved.funcName = x.funcName;
                    //p ( " adding a pending execution after var init " + t + " notamper_index - " + 
                    //    xcSaved.notamper_index + " return value - " + u + " next - " + n); 
                    p(" FORKED: adding a new pending execution "); 
                    PendingExecutions.add( xcSaved );
                    printPendingExecutions( PendingExecutions ); 
                } 
                
                if ( ++i == j)
                    break;
            }

            for (var i = 0, j = a.length; ;) 
            {
                //p ( " \t next consideration - " + " i - " + i + " j - " + j + " = " + a[i]);
                var t1 = a[i];                       // next case (might be default!)
                if (t1.type != CASE) 
                {
                    //u = "defaultValue";
                    var pc2 = ""  + s + " == defaultValue";
                    updatePC (x, pc2);
                    break;
                    //sc.object[t] = u;
                }
                
                if ( ++i == j)
                    break;
            }
            
            // fall through and concrete execute the default case.         
        }
        
        // concrete exec 
        pv ( " entering concrete exec - PC : " + x.programCondition);
      switch_loop:
        for (i = 0, j = a.length; ; i++) {
            if (i == j) {
                if (n.defaultIndex >= 0) {
                    i = n.defaultIndex - 1; // no case matched, do default
                    matchDefault = true;
                    continue;
                }
                break;                      // no default, exit switch_loop
            }
            t = a[i];                       // next case (might be default!)
            if (t.type == CASE) {
                u = getValue(execute(t.caseLabel, x));
            } else {
                if (!matchDefault)          // not defaulting, skip for now
                    continue;
                u = s;                      // force match to do default
            }
            if (u === s) {
                for (;;) {                  // this loop exits switch_loop
                    if (t.statements.length) {
                        try {
                            execute(t.statements, x);
                        } catch (e if e == BREAK && x.target == n) {
                            x.switchCase = false;
                            break switch_loop;
                        }
                    }
                    if (++i == j)
                    {
                        x.switchCase = false;
                        break switch_loop;
                    }
                    t = a[i];
                }
                // NOT REACHED
            }
        }
        break;

      case FOR:
      // generally loops are not used to validate an individual form input. 
      // symb exec : 
        // - require the condition of loops to be non-symbolic i.e., only allow
        // loops to execute in concrete mode. Realize that loop bodies may be 
        // symbolic in turn also program condition to reach the loop may be 
        // symbolic. 
        
        if ( FOR == n.type )
            pv ( " Execute : FOR Loop ");
        n.setup && getValue(execute(n.setup, x));
        // FALL THROUGH
      case WHILE:
        if ( WHILE == n.type )
            pv ( " Execute : WHILE ");
        // while (!n.condition || getValue(execute(n.condition, x))) {
         while (!n.condition) {
            var condValue = getValue(execute(n.condition, x));
            if ( isSymbolic (condValue) )
            {
                die_with_message ( " NoTamper: Does not execute loops with symbolic conditions - " + 
                    " condition - " + n.condition + " loop - " + n);
            }
            
            if (!condValue)
                break;
                
            try {
                execute(n.body, x);
            } catch (e if e == BREAK && x.target == n) {
                break;
            } catch (e if e == CONTINUE && x.target == n) {
                continue;
            }
            n.update && getValue(execute(n.update, x));
        }
        break;

      case FOR_IN:
        // TODO ? symbolic execution
        
        pv ( " Execute : FOR_IN ");
        u = n.varDecl;
        if (u)
            execute(u, x);
        r = n.iterator;
        s = execute(n.object, x);
        v = getValue(s);

        // ECMA deviation to track extant browser JS implementation behavior.
        t = (v == null && !x.ecmaStrictMode) ? v : toObject(v, s, n.object);
        a = [];
        for (i in t)
            a.push(i);
        for (i = 0, j = a.length; i < j; i++) {
            putValue(execute(r, x), a[i], r);
            try {
                execute(n.body, x);
            } catch (e if e == BREAK && x.target == n) {
                break;
            } catch (e if e == CONTINUE && x.target == n) {
                continue;
            }
        }
        break;

      case DO:
      // same as in for / while loop - demand the do-while condition to be 
      // concrete. 
        do {
            try {
                execute(n.body, x);
            } catch (e if e == BREAK && x.target == n) {
                break;
            } catch (e if e == CONTINUE && x.target == n) {
                continue;
            }
            var condValue = getValue(execute(n.condition, x));
            if ( isSymbolic (condValue) )
            {
                die_with_message ( " NoTamper: Does not execute loops with symbolic conditions - " + 
                    " condition - " + n.condition + " loop - " + n);
            }

        } while (condValue);
        break;

      case BREAK:
      case CONTINUE:
      // symb execution : nothing specific 
        x.target = n.target;
        throw n.type;

      case TRY:
        // TODO : Symbolic execution ? 
        try {
            execute(n.tryBlock, x);
        } catch (e if e == THROW && (j = n.catchClauses.length)) {
            e = x.result;
            x.result = undefined;
            for (i = 0; ; i++) {
                if (i == j) {
                    x.result = e;
                    throw THROW;
                }
                t = n.catchClauses[i];
                x.scope = {object: {}, parent: x.scope};
                x.scope.object.__defineProperty__(t.varName, e, true);
                try {
                    if (t.guard && !getValue(execute(t.guard, x)))
                        continue;
                    execute(t.block, x);
                    break;
                } finally {
                    x.scope = x.scope.parent;
                }
            }
        } finally {
            if (n.finallyBlock)
                execute(n.finallyBlock, x);
        }
        break;

      case THROW:
      // TODO:  symbolic execution 
        x.result = getValue(execute(n.exception, x));
        throw THROW;

      case RETURN:
      {
        p ( " Execute : RETURN : " + n.value + " PC = " + x.programCondition);
        //p ( " return node - " + n);
        //p ( " execution context - "); 
        //printXC ( x );
        x.result = getValue(execute(n.value, x));
        if ( x.programCondition != "true" )
        {
            var crntFn = x.callee; 
            var callerFn = x.caller; 
            pv ( " current function node - " + crntFn + " caller - " + callerFn);
            var formals = crntFn.node.params;
            var actuals = [];
            if ( formals != null )
            {
                pv ( " \t\t formals - " + formals);
                for ( var i = 0 ; i < formals.length ; i++)
                {
                    var t = "" + formals[i];
                    pv ( " \t\t\t formal : " + t + " actual - " + x.scope.object[t]);
                    actuals[i] = x.scope.object[t];
                }
            }
            pv ( " actuals  - " + actuals);
            rr = new ReturnRecord ( RRIndex++ , crntFn.node.name, x.result, x.programCondition, actuals);
            p ( " return record #" + rr.index +" \t funcName : " + rr.funcName + " \t returns = " + rr.retValue + 
                " \t pc = " + rr.condition);

            ReturnRecords.add( rr );
            p ( " stored the result of function return - " + x.programCondition +  " return value = " + 
                x.result);
            p ( " collection after storing the result - ");
            // printReturnRecords ( ReturnRecords );
//            p ( " current function - " + crntFn );
//            p ( " left over - " + leftOver);
            executeNextPending ( x );
            
        }   
        throw RETURN;
      }
      case WITH:
        // TODO : No Symbolic exec
        //      p ( " Execute : WITH ");
        r = execute(n.object, x);
        t = toObject(getValue(r), r, n.object);
        x.scope = {object: t, parent: x.scope};
        try {
            execute(n.body, x);
        } finally {
            x.scope = x.scope.parent;
        }
        break;

      case VAR:
      case CONST:              
        // if the var initialization is of the form var v = f();
        // fork symbolic execution if the called function was symbolically
        // executed.
        /*
        {
            p(" forking symbolic exec for - " + n[i].name);
            //forkSymbolicExecution ( n[i].name , n[i].initializer , x, n.nextInstruction, n.type);                     
        }*/
        p("handling var / const \n");
        for (i = 0, j = n.length; i < j; i++){
            var u = n[i].initializer;   
            if (!u)
                continue;
                
            var t = n[i].name;
            for (var s = x.scope; s; s = s.parent) {
                if (hasDirectProperty(s.object, t))
                    break;
            }
            
            var u1 = getValue(execute(u, x));
            if(s != null){
		        if (n.type == CONST)
                    s.object.__defineProperty__(t, u1, x.type != EVAL_CODE, true);
                else
                    s.object[t] = u1;
            }
        }
        break;

      case DEBUGGER:
        throw "NYI: " + tokens[n.type];

      case SEMICOLON:
        // fixed the nextInstruction of expression to be that
        // of current instruction  
        if (n.expression)
        {
            n.expression.nextInstruction = n.nextInstruction;
            x.result = getValue(execute(n.expression, x));
        }
        break;

      case LABEL:
      // TODO: Any special handling here? 
        try {
            execute(n.statement, x);
        } catch (e if e == BREAK && x.target == n) {
        }
        break;

      case COMMA:
      // TODO : Special handling? 
        for (i = 0, j = n.length; i < j; i++)
            v = getValue(execute(n[i], x));
        break;

      case ASSIGN:
        var r = execute(n[0], x);

        t = n[0].assignOp;
        pv ( " \t\t r = " + r + " t = " + t );
        
        if ( n[0].type == IDENTIFIER && n[0].value == "notamper_execution_ends")
        {
			try{
				while(!PendingExecutions.isEmpty()){
					executeNextPending(x);
				}
			}catch (e){
			}
            p ( "########################### Reached end of execution ");
            // printReturnRecords ( ReturnRecords );
            outputJSConstraints ( ReturnRecords );
            NT_execution_ended = true; 
        }

        if ( n[0].type == IDENTIFIER && n[0].value == "notamper_execution_begins")
        {
            p ( "########################### Begin of the Symbolic execution ");
            NT_execution_started = true; 
        }

        
        if (t)
            u = getValue(r);
        
        if (n[1].type != CALL)
        {
            v = getValue(execute(n[1], x));
        }
        else
        {
          //  var x1R = x.calledExecutionContext_result; 
          //  var x1PC = x.calledExecutionContext_programCondition;
          //  p ( " RHS - function call. return - " + x1R + " pc - " + x1PC);

            // fork symbolic execution if function is symbolically executed. 
            // 1 : lhs
            // 2 : rhs expression 
            // 3 : execution context;  
            pv ( " checkout assign stmt - " + n[0] + " = " + n[1] + " and next - " + n.nextInstruction);
           //v = forkSymbolicExecution ( n[0].value , n [1] , x, n.nextInstruction, n.type);                            
           
            var u = n[1];   
            if (!u)
                return;
                
            var t = n[0].value;
            for (var s = x.scope; s; s = s.parent) {
                if (hasDirectProperty(s.object, t))
                    break;
            }
            var u1 = getValue(execute(u, x));

            if(s != null){
		        if (n.type == CONST)
                    s.object.__defineProperty__(t, u1, x.type != EVAL_CODE, true);
                else
                    s.object[t] = u1;
            }
            
        }
        
        
        if (t) {
            //die_with_message ( " sym exec not handled for assign stmt - " + n[0].value + " =  " + n[1]);
            
            switch (t) {
              case BITWISE_OR:  v = u | v; break;
              case BITWISE_XOR: v = u ^ v; break;
              case BITWISE_AND: v = u & v; break;
              case LSH:         v = u << v; break;
              case RSH:         v = u >> v; break;
              case URSH:        v = u >>> v; break;
              case PLUS:        v = u + v; break;
              case MINUS:       v = u - v; break;
              case MUL:         v = u * v; break;
              case DIV:         
			  	v = u / v; 
				break;
              case MOD:         v = u % v; break;
            }
        }
        putValue(r, v, n[0]);
        break;

      case HOOK:
      // symb exec : Similar to if-then-else
        conditionValue = execute(n[0], x);    
        if ( isSymbolic ( conditionValue ) )
        {
            p(" Symbolic execution of hook condition : symbolic condition - " + conditionValue);
            if ( toExecute != null )
            {
                toExecute.nextInstruction = n[2];
                toExecute.notamper_index = RRIndex ++ ;
                toExecute.funcName = x.callee.node.name;
                p ( "FORKED: adding a pending execution notamper_index - " + 
                    toExecute.notamper_index + " next - " + toExecute.nextInstruction); 
                PendingExecutions.add( toExecute );
                toExecute = null;
                printPendingExecutions( PendingExecutions ); 
            }
                        
            v = execute(n[1], x);     
        }
        else
        {
            // execute hook concretely
            pv (" Concrete execution of hook condition");
            if (getValue(conditionValue))
                v = execute(n[1], x);
            else if (n.elsePart)
                v = execute(n[2], x);
        }

        break;

      case OR:

  //      var bRet = false;
        v = getCondition(n, x, true);
		p1(" OR - condition - " + v);
        // bRet = enumeratePossiblePathConditions(n, x, true);
//        ++clauseCounter; 
//        p ( " OR Debug - n[0] - " + n[0]);
//        p ( " OR Debug - n[1] - " + n[1]);
//        var vlOr = getValue (execute(n[0], x));
//        
//        addRecordIfAbsent( vlOr, conditionCases );
//        
//        p ( " value of vlOr - " + vlOr);
//           
//        var vrOr = getValue (execute(n[1], x));
//        addRecordIfAbsent (vrOr, conditionCases);
//        var symb = false; 
//        if (isSymbolic(vlOr) || isSymbolic(vrOr))
//        {
//            p ( " Condition Record before processing - " ); printConditionRecords(conditionCases);

//            // copy the current true records to new collection of conditions
//            var newConditions = new DP_ObCollectionOrdered("index", ReturnRecord);             
//            var tConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 
//            var fConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 

//            var j = 0; 
//            var jc = conditionCases.getCount ();
//            var mem = null;
//            var memF = null; // first condition case w/ false results
//                            // there is only one condition in case of ORs.
//            for ( ; j < jc ; j++)
//            {
//                mem = conditionCases.getAt(j);
//                p ( " now processing - " + mem.condition);
//                // do not process the clause conditions that do not belong 
//                // to this level here 
//                if(mem.nestingDepth != clauseCounter)
//                {
//                    newConditions.add(mem);
//                    continue; 
//                }

//                if (mem.boolValue)
//                {                    
//                    // PC conditions that lead to true values
//                    // are short-circuited. 
//                    bRet = mem.condition; 
//                    var newcond = new ConditionRecord(conditionIndex++, true, mem.condition);
//                    newcond.processed = false; 
//                    newConditions.add(newcond);
//                    tConditions.add(newcond);
//                }
//                else
//                {
//                    p  (" adding to false repository - " + mem.condition + " " + mem.boolValue);
//                    fConditions.add(mem);
//                }
//            }
//            
//            var i = 0;
//            j = 0; 
//            var fCount = fConditions.getCount();
//            var tCount = tConditions.getCount();
//            var falsePC = "";
//            for ( ; i < fCount ; i++ )
//            {                            
//                var memF = fConditions.getAt(i);
//                p (" creating true records - " + memF.condition);
//                if(!memF.processed)
//                {
//                    for(j = 0; j < tCount ; j++)
//                    {
//                        var memT = tConditions.getAt(j);
//                        //if(memT.proceseed)
//                        //    continue; 
//                                               
//                        var newpc = getNonFalsePC(memF.condition, memT.condition); //memF.condition + " AND " + memT.condition;
//                        if(newpc == null)
//                            continue; 
//                              
//                        var newcond = new ConditionRecord(conditionIndex++, memT.boolValue, newpc);
//                        newcond.processed = true; 
//                        newConditions.add(newcond);
//                    }
//                }
//                                
//                falsePC += memF.condition;
//                if(i < fCount - 1)
//                    falsePC += " AND ";                 
//            }
//            
//            var newcond = new ConditionRecord(conditionIndex++, false, falsePC);
//            newConditions.add(newcond);
//            
//            conditionCases = newConditions;

//            // now demote the clauses to enclosing nesting depth to allow
//            // them to be combined to those clauses
//            j = 0; 
//            jc = conditionCases.getCount ();
//            var inLevel = 0;
//            for ( ; j < jc ; j++ )
//            {                            
//                mem = conditionCases.getAt(j);
//                if(mem.nestingDepth != clauseCounter)
//                    continue; 
//                else
//                {
//                    if(mem.boolValue)
//                        bRet = mem.condition;
//                    mem.nestingDepth--;
//                    mem.processed = true; 
//                }
//            }


//            p ( " Condition Record after processing - " ); printConditionRecords(conditionCases);
//        }        
//        else
//        {
//            bRet = (vlOr || vrOr);
//        }
//        
//        --clauseCounter;        
//        v = bRet; 
        break;

      case AND:
        v = getCondition(n, x, false);

//        var bRet = enumeratePossiblePathConditions(n, x, false);
        //v = bRet; 
        break;
//        p ( " AND Debug - n[0] - " + n[0]);
//        p ( " AND Debug - n[1] - " + n[1]);
//        ++clauseCounter;
//        var bRet = false; 
//        var vlAnd = getValue (execute(n[0], x));
//        addRecordIfAbsent( vlAnd, conditionCases );

//        var vrAnd = getValue (execute(n[1], x));
//        addRecordIfAbsent( vrAnd, conditionCases );

//        var symb = false; 
//        if (isSymbolic(vlAnd) || isSymbolic(vrAnd))
//        {
//            p ( " Condition Record before processing - " ); printConditionRecords(conditionCases);

//            var tConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 
//            var fConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 
//            var newConditions = new DP_ObCollectionOrdered("index", ReturnRecord); 
//            
//            var j = 0; 
//            var jc = conditionCases.getCount ();
//            var mem = null;
//            var memT = null; // first condition case w/ true results
//                            // there is only one condition in case of ANDs.
//            for ( ; j < jc ; j++)
//            {
//                mem = conditionCases.getAt(j);
//                // do not process the clause conditions that do not belong 
//                // to this level here 
//                if(mem.nestingDepth != clauseCounter)
//                {
//                    newConditions.add(mem);
//                    continue; 
//                }

//                if (!mem.boolValue)// && mem.processed)
//                {
//                    // PC conditions that lead to false values
//                    // are short-circuited. 
//                    bRet = mem.condition; 
//                    var newcond = new ConditionRecord(conditionIndex++, false, mem.condition);
//                    newcond.processed = true; 
//                    newConditions.add(newcond);
//                    fConditions.add(newcond);
//                }
//                else                
//                {
//                    tConditions.add(mem);
//                }
//            }
//            
//            j = 0;
//            var i = 0; 
//            var fCount = fConditions.getCount();
//            var tCount = tConditions.getCount();
//            var truePC = "";

//            for ( ; i < tCount ; i++ )
//            {
//               var memT = tConditions.getAt(i);

//                for(j = 0; j < fCount ; j++)
//                {
//                    var memF = fConditions.getAt(j);
//                    
//                    var newpc = getNonFalsePC(memT.condition, memF.condition); 
//                    if(newpc == null)
//                        continue; 
//                          
//                    var newcond = new ConditionRecord(conditionIndex++, memF.boolValue, newpc);
//                    newcond.processed = true; 
//                    newConditions.add(newcond);
//                }
//                
//                truePC += memT.condition;
//                if(i < tCount - 1)
//                    truePC += " AND ";                 
//            }
//            
//            var newcond = new ConditionRecord(conditionIndex++, true, truePC);
//            newConditions.add(newcond);

//            conditionCases = newConditions;
//            
//           // now demote the clauses to enclosing nesting depth to allow
//            // them to be combined to those clauses
//            j = 0; 
//            jc = conditionCases.getCount ();
//            var inLevel = 0;
//            for ( ; j < jc ; j++ )
//            {                            
//                mem = conditionCases.getAt(j);
//                if(mem.nestingDepth != clauseCounter)
//                    continue; 
//                else
//                {
//                    mem.nestingDepth--;
//                    mem.processed = true; 
//                }
//            }

//            p ( " Condition Record after processing - " ); printConditionRecords(conditionCases);
//        }        
//        else
//        {
//            bRet = (vlAnd && vrAnd);
//        }
//        
//        --clauseCounter;        
//        v = bRet;
//        break;

      case BITWISE_OR:
        die_with_message ( " BITWISE OR Not handled - n[0]" + n[0] + " \n n[1] - " + n[1]);
        v = getValue(execute(n[0], x)) | getValue(execute(n[1], x));
        break;

      case BITWISE_XOR:
        die_with_message ( " BITWISE XOR Not handled - n[0]" + n[0] + " \n n[1] - " + n[1]);
        v = getValue(execute(n[0], x)) ^ getValue(execute(n[1], x));
        break;

      case BITWISE_AND:
        die_with_message ( " BITWISE AND Not handled - n[0]" + n[0] + " \n n[1] - " + n[1]);
        v = getValue(execute(n[0], x)) & getValue(execute(n[1], x));
        break;

      case EQ:
      case NE:
      case STRICT_EQ:
      case STRICT_NE:
      case LT:
      case LE:
      case GE:
      case GT:
      case PLUS:
      case MINUS:
      case MUL:
      case DIV:
      case MOD:
      
        // overloaded function
        // if symb exec : returns the true condition i.e., PC for NE being true
        // else returns the outcome of the evaluation i.e., v1 != v2
        v = executeBinaryOperator(n,x);
        break;

      case IN:
        die_with_message(" In operator not handled for - " + n[0] + 
            " and n[1] - " + n[1]);
        v = getValue(execute(n[0], x)) in getValue(execute(n[1], x));
        break;

      case INSTANCEOF:
        die_with_message(" INSTANCEOF not handled for - " + n[0] + 
            " and n[1] - " + n[1]);
        t = getValue(execute(n[0], x));
        u = getValue(execute(n[1], x));
        if (isObject(u) && typeof u.__hasInstance__ == "function")
            v = u.__hasInstance__(t);
        else
            v = t instanceof u;
        break;

      case LSH:
        die_with_message(" LSH not handled for - " + n[0] + 
            " and n[1] - " + n[1]);

        v = getValue(execute(n[0], x)) << getValue(execute(n[1], x));
        break;

      case RSH:
        die_with_message(" RSH not handled for - " + n[0] + 
            " and n[1] - " + n[1]);

        v = getValue(execute(n[0], x)) >> getValue(execute(n[1], x));
        break;

      case URSH:
        die_with_message(" URSH not handled for - " + n[0] + 
            " and n[1] - " + n[1]);

        v = getValue(execute(n[0], x)) >>> getValue(execute(n[1], x));
        break;


      case DELETE:
        //die_with_message(" DELETE not handled for - " + n[0]);

        t = execute(n[0], x);
        v = !(t instanceof Reference) || delete t.base[t.propertyName];
        break;

      case VOID:
        getValue(execute(n[0], x));
        break;

      case TYPEOF:
//      die_with_message(" TYPEOF not handled for - " + n[0]);

        t = execute(n[0], x);
        if (t instanceof Reference)
            t = t.base ? t.base[t.propertyName] : undefined;
        v = typeof t;
        break;

      case NOT:
        p(" Executing NOT - " + n[0]);
//        printConditionRecords(conditionCases);
         
        v = getValue(execute(n[0], x));
        p1(TMP_DEBUG, " NOT Execution argument - " + v);
        if(isSymbolic(v))
        {
            // check to see if RE.test eval has already added a condition 
            // to the condition Cases. 
            if(conditionCases.getCount() == 1){
                var mem = conditionCases.getAt(0);
				var tPc = mem.condition;
				if(tPc.indexOf(v) != -1){
                    conditionCases.clear();
                }
            } 
            v = negateThisCondition ( v );
        
            // flip all values of condition records; 
//            p(" Executing NOT symbolically ");
//            
//            printConditionRecords(conditionCases);
//            
//            var tmpCases = new DP_ObCollectionOrdered("index", ConditionRecord); 
//            var i = 0; 
//            var count = conditionCases.getCount();
//            for ( ; i < count ; i++)
//            {
//                var mem = conditionCases.getAt(i);
//                p ( " \t Condition Case #" + mem.index + " \t : " + 
//                    mem.boolValue + " \t pc = " + mem.condition + 
//                    " \t processed - " + mem.processed);
//                mem.boolValue = !mem.boolValue;
//                tmpCases.add(mem);
//            }
//            conditionCases = tmpCases; 
//            printConditionRecords(conditionCases);
        }
        else
        {
            v = !v;
        }
        break;

      case BITWISE_NOT:
          die_with_message ( " BITWISE NOT Not handled - n[0]" + n[0]);
        v = ~getValue(execute(n[0], x));
        break;

      case UNARY_PLUS:
          die_with_message ( " UNARY_PLUS Not handled - n[0]" + n[0]);

        v = +getValue(execute(n[0], x));
        break;

      case UNARY_MINUS:
       // die_with_message ( " UNARY_MINUS Not handled - n[0]" + n[0]);

        v = -getValue(execute(n[0], x));
        break;

      case INCREMENT:
      case DECREMENT:
      die_with_message ( " INCREMENT/DECREMENT Not handled - n[0]" + n[0]);

        t = execute(n[0], x);
        u = Number(getValue(t));
        if (n.postfix)
            v = u;
        putValue(t, (n.type == INCREMENT) ? ++u : --u, n[0]);
        if (!n.postfix)
            v = u;
        break;

      case DOT:
        r = execute(n[0], x);
        t = getValue(r);
        u = n[1].value;
		p("cme - " + t + " " +  n[0].value + " b2 - " + u ); 
		if(isSymbolic(t)){
	        if(n[1].value == "length"){
			    newV = "(len " + t + ")"; 
			    putValue(r, newV, n[0]);
			    v = newV; 
			} //else if (n[1].value == "test")
		} else {
        	v = new Reference(toObject(t, r, n[0]), u, n);
		}
		p(" done ");
        break;

      case INDEX:
        r = execute(n[0], x);
        t = getValue(r);
        u = getValue(execute(n[1], x));
        v = new Reference(toObject(t, r, n[0]), String(u), n);
        break;

      case LIST:
        // Curse ECMA for specifying that arguments is not an Array object!
        v = {};
        for (i = 0, j = n.length; i < j; i++) {
            value = execute(n[i], x);
            u = getValue(value);
            v[i] = u;
            //Abeer OLD v.__defineProperty__(i, u, false, false, true);
        }
      v.length = i;
        //Abeer OLD v.__defineProperty__('length', i, false, false, true);
        break;


      case CALL:
        
        r = execute(n[0], x);
        a = execute(n[1], x);
        f = getValue(r);
        p ("In call here :  n[0] - " + n[0] + " n[1] - " + n[1]);
        var argSymb = isSymbolicAdv(n[1], a);
        p (" r - " + r + " a - " + a + " f - " + f + "  - " + argSymb);
        if(argSymb != false){
            // check if the function is a regex match 
            if (("" + r).indexOf(".test") != -1){
                var argRE = getValue(execute(n[0][0], x));
                p(" found a regex match " + r + " args - " + argSymb + " regex - " + argRE);
                var tCond = "IN " + argSymb + " \"" + argRE + "\""; 
                var fCond = negateThisCondition ( tCond ); 
                p(" fork SE: true - " + tCond + " false - " + fCond);
                conditionCases.add(new ConditionRecord(conditionIndex++, true, tCond));
                v = tCond;
                return v;  
            } else {
                //die_with_message(" arg is symbolic - "  + argSymb + " RE - " + argRE + " function - " + r);
            }
        }   
        
        { 
        
            var body = "" + f;         
            if (! isBooleanReturn(r, body)){
                v = "";
            } else {
                
                if (isPrimitive(f) || typeof f.__call__ != "function") {
                    throw new TypeError(r + " is not callable",
                                        n[0].filename, n[0].lineno);
                }
                t = (r instanceof Reference) ? r.base : null;
                if (t instanceof Activation)
                    t = null;
                v = f.__call__(t, a, x);
            }
       }
       break;

      case NEW:
      case NEW_WITH_ARGS:
/*
        r = execute(n[0], x);
        f = getValue(r);
        if (n.type == NEW) {
            a = {};
            a.__defineProperty__('length', 0, false, false, true);
        } else {
            a = execute(n[1], x);
        }
        if (isPrimitive(f) || typeof f.__construct__ != "function") {
            throw new TypeError(r + " is not a constructor",
                                n[0].filename, n[0].lineno);
        }
        v = f.__construct__(a, x);
        break;
*/

            r = execute(n[0], x);
        f = getValue(r);
        if (n.type == NEW) {
            a = {};
            a.length = 0;
        } else {
            a = execute(n[1], x);
        }
        if (isPrimitive(f) || typeof f.__construct__ != "function") {
            throw new TypeError(r + " is not a constructor",
                                n[0].filename(), n[0].lineno);
        }
        v = f.__construct__(a, x);
        break;

      case ARRAY_INIT:
        v = [];
        for (i = 0, j = n.length; i < j; i++) {
            if (n[i])
                v[i] = getValue(execute(n[i], x));
        }
        v.length = j;
        break;

      case OBJECT_INIT:
        v = {};
        for (i = 0, j = n.length; i < j; i++) {
            t = n[i];
            if (t.type == PROPERTY_INIT) {
                v[t[0].value] = getValue(execute(t[1], x));
            } else {
                f = new FunctionObject(t, x.scope);
                u = (t.type == GETTER) ? '__defineGetter__'
                                       : '__defineSetter__';
                v[u](t.name, thunk(f, x));
            }
        }
        break;

      case NULL:
        v = null;
        break;

      case THIS:
        v = x.thisObject;
        break;

      case TRUE:
        v = true;
        break;

      case FALSE:
        v = false;
        break;

      case IDENTIFIER:
        for (s = x.scope; s; s = s.parent) {
            if (n.value in s.object)
                break;
        }
                
        v = new Reference(s && s.object,  n.value, n);
        //v.notamper_symbolic = n.notamper_symbolic;
        //p("\t creating a new reference - " + s + " object - " + v + " \n");

        break;

      case NUMBER:
      case STRING:
      case REGEXP:
        v = n.value;
        break;

      case GROUP:
        v = execute(n[0], x);
        break;

      default:
        throw "PANIC: unknown operation " + n.type + ": " + uneval(n);
    }

    return v;
}

function isSymbolic ( v )
{
    var isS = false; 
    // first a cheap check to avoid heavy processing 
    v = "" + v;  
    isS = ((v != null) && (v.indexOf("_notamper_symbolic") != -1));
    if(isS == true)
        return true; 

    return false;
}

function isSymbolicAdv ( n, v )
{
    var isS = false; 
    // first a cheap check to avoid heavy processing 

//    if(v.isSymbolic != undefined){
//        p(" found value's isSymbolic property -" + v.isSymbolic);
//        return v.isSymbolic;
//    }

    p(" here now typeof - " + (typeof n) + " and type - " + (n.type == LIST));
    switch(n.type){
    
        case LIST: {
        
            var str = "";
            var sym = false; 
            if(v.length > 1){
                str += "(";
            }
            
            for (i = 0, j = v.length; i < j; i++) {    
                p ( "v[ " + i + "] = " +  v[i] + " \n") ;
                if(isSymbolic(v[i])){
                    sym = true; 
                }
                str += v[i]; 
                
                if(i < v.length - 1){
                    str += " DELIMIT "; 
                }
            }         
            
            if(v.length > 1){
                str += ")";
            }   
            if(sym){
                return str; 
            }
        }
    }
    return false;
}

function Activation(f, a) {

  for (var i = 0, j = f.params.length; i < j; i++)
         this[f.params[i]] = a[i];
       this.arguments = a;
    /*for (var i = 0, j = f.params.length; i < j; i++)
        this.__defineProperty__(f.params[i], a[i], true);
    this.__defineProperty__('arguments', a, true);
*/
}

// Null Activation.prototype's proto slot so that Object.prototype.* does not
// pollute the scope of heavyweight functions.  Also delete its 'constructor'
// property so that it doesn't pollute function scopes.  But first, we must
// copy __defineProperty__ down from Object.prototype.

Activation.prototype.__defineProperty__ = Object.prototype.__defineProperty__;
Activation.prototype.__proto__ = null;
delete Activation.prototype.constructor;

function FunctionObject(node, scope) {
//Abeer I changed this
   // this.node = node;
   // this.scope = scope;
  //  this.__defineProperty__('length', node.params.length, true, true, true);
 //   var proto = {};
//    this.__defineProperty__('prototype', proto, true);
  ////  proto.__defineProperty__('constructor', this, false, false, true);


    this.node = node;
    this.scope = scope;
    this.length = node.params.length;
    var proto = {};
    this.prototype = proto;
    proto.constructor = this;
}

var FOp = FunctionObject.prototype = {
    // Internal methods.
    __call__: function (t, a, x) {
        var x2 = new ExecutionContext(FUNCTION_CODE);
        x2.thisObject = t || global;
        x2.caller = x;
        x2.callee = this;
        // Abeer: I removed this a.__defineProperty__('callee', this, false, false, true);
        a.callee = this;
        var f = this.node;
        x2.scope = {object: new Activation(f, a), parent: this.scope};
        ExecutionContext.current = x2;
        try {
            execute(f.body, x2);
        } catch (e if e == RETURN) {
            x.calledExecutionContext_result = x2.result;
            x.calledExecutionContext_programCondition = x2.programCondition; 
            return x2.result;
        } catch (e if e == THROW) {
            x.result = x2.result;
            x.calledExecutionContext_result = x2.result;
            x.calledExecutionContext_programCondition = x2.programCondition;
            throw THROW;
        } finally {
            x.calledExecutionContext_result = x2.result;
            x.calledExecutionContext_programCondition = x2.programCondition;
            ExecutionContext.current = x;
            //x.programCondition = x2.programCondition;
        }
        return undefined;
    },

    __construct__: function (a, x) {
        var o = new Object;
        var p = this.prototype;
        if (isObject(p))
            o.__proto__ = p;
        // else o.__proto__ defaulted to Object.prototype

        var v = this.__call__(o, a, x);
        if (isObject(v))
            return v;
        return o;
    },

    __hasInstance__: function (v) {
        if (isPrimitive(v))
            return false;
        var p = this.prototype;
        if (isPrimitive(p)) {
            throw new TypeError("'prototype' property is not an object",
                                this.node.filename, this.node.lineno);
        }
        var o;
        while ((o = v.__proto__)) {
            if (o == p)
                return true;
            v = o;
        }
        return false;
    },

    // Standard methods.
    toString: function () {
        return this.node.getSource();
    },

    apply: function (t, a) {
        // Curse ECMA again!
        if (typeof this.__call__ != "function") {
            throw new TypeError("Function.prototype.apply called on" +
                                " uncallable object");
        }

        if (t === undefined || t === null)
            t = global;
        else if (typeof t != "object")
            t = toObject(t, t);

        if (a === undefined || a === null) {
            a = {};
            a.__defineProperty__('length', 0, false, false, true);
        } else if (a instanceof Array) {
            var v = {};
            for (var i = 0, j = a.length; i < j; i++)
                v.__defineProperty__(i, a[i], false, false, true);
            v.__defineProperty__('length', i, false, false, true);
            a = v;
        } else if (!(a instanceof Object)) {
            // XXX check for a non-arguments object
            throw new TypeError("Second argument to Function.prototype.apply" +
                                " must be an array or arguments object",
                                this.node.filename, this.node.lineno);
        }

        return this.__call__(t, a, ExecutionContext.current);
    },

    call: function (t) {
        // Curse ECMA a third time!
        var a = Array.prototype.splice.call(arguments, 1);
        return this.apply(t, a);
    }
};

// Connect Function.prototype and Function.prototype.constructor in global.
reflectClass('Function', FOp);

// Help native and host-scripted functions be like FunctionObjects.
var Fp = Function.prototype;
var REp = RegExp.prototype;


/*Abeer I changed this 

if (!('__call__' in Fp)) {
    Fp.__defineProperty__('__call__', function (t, a, x) {
        // Curse ECMA yet again!
        a = Array.prototype.splice.call(a, 0, a.length);
        return this.apply(t, a);
    }, true, true, true);


    REp.__defineProperty__('__call__', function (t, a, x) {
        a = Array.prototype.splice.call(a, 0, a.length);
        return this.exec.apply(this, a);
    }, true, true, true);

    Fp.__defineProperty__('__construct__', function (a, x) {
        a = Array.prototype.splice.call(a, 0, a.length);
        return this.__applyConstructor__(a);
    }, true, true, true);

    // Since we use native functions such as Date along with host ones such
    // as global.eval, we want both to be considered instances of the native
    // Function constructor.
    Fp.__defineProperty__('__hasInstance__', function (v) {
        return v instanceof Function || v instanceof global.Function;
    }, true, true, true);
}
*/


if (!('__call__' in Fp)) {
    Fp.__call__ = function (t, a, x) {
        // Curse ECMA yet again!
        a = Array.prototype.splice.call(a, 0, a.length);
        return this.apply(t, a);
    };

    REp.__call__ = function (t, a, x) {
        a = Array.prototype.splice.call(a, 0, a.length);
        return this.exec.apply(this, a);
    };

    Fp.__construct__ = function (a, x) {
        switch (a.length) {
          case 0:
            return new this();
          case 1:
            return new this(a[0]);
          case 2:
            return new this(a[0], a[1]);
          case 3:
            return new this(a[0], a[1], a[2]);
          case 4:
            return new this(a[0], a[1], a[2], a[3]);
          case 5:
            return new this(a[0], a[1], a[2], a[3], a[4]);
          case 6:
            return new this(a[0], a[1], a[2], a[3], a[4], a[5]);
          case 7:
            return new this(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
        }
        throw "PANIC: too many arguments to constructor";
    }

    // Since we use native functions such as Date along with host ones such
    // as global.eval, we want both to be considered instances of the native
    // Function constructor.
    Fp.__hasInstance__ = function (v) {
        return v instanceof Function || v instanceof global.Function;
    };
}

function thunk(f, x) {
    return function () { return f.__call__(this, arguments, x); };
}

function evaluate(s, f, l) {
    if (typeof s != "string")
        return s;
    
    //print (" in evaluate \n");

    var x = ExecutionContext.current;
    var x2 = new ExecutionContext(GLOBAL_CODE);
    ExecutionContext.current = x2;
    try {
        //print("beginning to parse...\n");
        p1(TMP_DEBUG, "beginning to parse...\n");
		p1(TMP_DEBUG, s);
        var parsed = parse(s, f, l);
        p1(TMP_DEBUG, "parsing completed...\n");
       // print("parsing completed...\n");
       // print(parsed);
        execute(parsed, x2);
    } catch (e if e == THROW) {
        if (x) {
            x.result = x2.result;
            throw THROW;
        }
        throw x2.result;
    } finally {
        ExecutionContext.current = x;
    }
    return x2.result;



}

/*********************************************************** notamper start **/
var toExecute ;
var leftOver ;
const TMP_DEBUG = 0;
const TMP_VERBOSE = false; 
var globalDebug = false; 

function p1 (level, str)
{
    if(level == TMP_DEBUG && globalDebug)
    {
      //  str = str.replace(/_notamper_symbolic/g, "_S");
        print("TMP_DEBUG:"  + str);
    }
}

function p (str)
{
    
    //str = str.replace(/_notamper_symbolic/g, "_S");
    if(globalDebug)
        print(str);
}

function pv (str)
{
    
    //str = str.replace(/_notamper_symbolic/g, "_S");
    if(TMP_VERBOSE == 1 && globalDebug)
        print(str);
}


function getXCType( xct )
{
    if (GLOBAL_CODE == xct) 
        return "GLOBAL_CODE";
    
    if (EVAL_CODE == xct)
        return "EVAL_CODE";
    
    if(FUNCTION_CODE == xct)
        return "FUNCTION_CODE";
        
    return "UNDEFINED";
}


// get the string representation of the properties 
// and values of the object ob. indent each one of them
// by 'indent' space on the left. 
function printObject( indent, ob )
{
    str = "";
    var t = typeof ob; 
    if ( t == "object" )
    {
        str += "{ ";
        for ( var prop in ob )
        {
//            str += indent + " property - " + prop + " value - ";
            str += prop + " : ";
            val = ob[prop];
            tp = typeof val; 
            if( tp == "object" )
            { 
                str += printObject ( indent + " \t ", val );
            }
            else
            {
                if ( tp == "function" )
//                    str += indent + " FUNC BODY";
                    str += " FUNC_BODY ";                    
                else
//                    str += indent + val;
                    str += val;        
            }
            str += " , ";
        }
        str += " } ";
    }
    else
    {
        if ( t == "function" )
            str += " FUNC_BODY";
//            str += indent + " FUNC BODY";
        else
            str += ob ;
//            str += indent + ob ;  
    }
       
    str +=  " } ";
    return str; 
}
    
function printScope ( indent, sc )
{
    // recursively print all scope until the parent is null
    i = 0; 
    for (s = sc; s ; s = s.parent) 
    {
        ob = s.object;
        if ( s.parent == null)
            break;
        p ( indent + " scope - \n" + printObject (indent + "\t", ob));
    }    
}

function printXC ( xc )
{
    p ( "  ----------- printing execution context ----------- ");
    p ( " \t current - " + xc.current);
    p ( " \t caller - " + xc.caller);
    
    var f1 = xc.callee; 
    p ( " \t callee - FUNCTION " + f1.node.name  )
    // p ( " type of callee - " + getNodeType ( f1.node)); 
    var formals = f1.node.params;
    if ( formals != null )
    {
        p ( " \t\t formals - " + formals);
        for ( var i = 0 ; i < formals.length ; i++)
        {
            var t = "" + formals[i];
            p ( " \t\t\t formal : " + t + " actual - " + xc.scope.object[t]);
        }
    }
//    p ( " \t callee - " + xc.callee +  
//        " params - " +  (f1.node.params) + 
//        " args - " + printObject (xc.scope.object.arguments));
    p ( " \t scope - ");
    printScope ( "\t\t", xc.scope );    
    p ( " \t thisObject - " + xc.thisObject);
    p ( " \t result - " + xc.result);
    p ( " \t target - " + xc.target);
    p ( " \t ecmaStrictMode - " + xc.ecmaStrictMode);
    p ( " \t type - " + getXCType(xc.type));
}


var recurs = 0;

var lastSeen = null;

var recurDepth = 0;

function retainOriginal( srcProp ){

    if(srcProp == "eval"
        || srcProp == "parseInt"
        || srcProp == "parseFloat"
        || srcProp == "isNaN"
        || srcProp == "isFinite"
        || srcProp == "decodeURI"
        || srcProp == "encodeURI"
        || srcProp == "decodeURIComponent"
        || srcProp == "encodeURIComponent"
        || srcProp == "Object"
        || srcProp == "Function"
        || srcProp == "Array"
        || srcProp == "String"
        || srcProp == "Boolean"
        || srcProp == "Number"
        || srcProp == "Date"
        || srcProp == "RegExp"
        || srcProp == "Error"
        || srcProp == "EvalError"
        || srcProp == "RangeError"
        || srcProp == "ReferenceError"
        || srcProp == "SyntaxError"
        || srcProp == "TypeError"
        || srcProp == "URIError"
        || srcProp == "Math"
        || srcProp == "snarf"
        || srcProp == "evaluate"
        || srcProp == "load"
        || srcProp == "print"
        || srcProp == "version"
        || srcProp == "alert"
        || srcProp == "confirm"
        || srcProp == "prompt"
        || srcProp == "unescape"
        || srcProp == "ecmaStrictMode"
        || srcProp == "__defineProperty__" 
        || srcProp == "NT_gebtn" 
        || srcProp == "NT_w"
        || srcProp == "addEventListener" 
        || srcProp == "appVersion"
        || srcProp == "attachEvent"
        || srcProp == "getElementsByTagName"
        || srcProp == "setTimeout"
        || srcProp == "userAgent"
        || srcProp == "wae"
        || srcProp == "wael"
        || srcProp == "wol"
        || srcProp == "woul"
        || srcProp == "write"
        || srcProp == "wsto"){
        
            return true; 
        } else {
            return false; 
        }

}

function cloneObject ( srcObj, depth )
{
    //print ("srcobj "+srcObj);
    var newObj = new Object;
    recurs ++; 
  
    
   
    for ( var srcProp in srcObj )
    {     
        if(srcProp == "nextInstruction" 
            ){
            p(" skipping next instruction copy ");
            //print("skipping next instruction copy");
            continue; 
        }

        if(retainOriginal(srcProp)){
            p(" retaining property - " + srcProp);
            newObj[srcProp] = srcObj[srcProp];
            continue; 
        }
        
        p(" cloning the property - " + srcProp);
       
        srcVal = srcObj[srcProp];
        t = typeof srcVal; 
        p ( " \t \t \t recursion depth - " + recurs + 
            " property - " + srcProp + " type - " + t + (t == "string" ? srcVal : ""));
        
        if(t != "function" && t == "object")
        { 
            p ( " \t \t nested calling ");
            if ( srcVal == null)
                newVal = null;
            else
            {
               // p ( " \t \t \t recursion for property ["+ recurs+"] - " + srcProp + " type - " + t + (t == "string" ? srcVal : ""));
             // p("lastseen "+ lastSeen +"srcVal :"+srcVal);  
              if ( lastSeen !== srcVal && depth <= 10) //lastSeen == null || 
                {
                    lastSeen = srcVal;
//print("clone 5: "+depth);
                       
                   newVal = cloneObject ( srcVal, depth );
                    depth = depth+1; 
                    

                }

            }
//            p ( " new value = " + newVal);
        }
        else
        {
            newVal = srcVal;
        }
        
        
        newObj[srcProp] = newVal;


   }
    recurs --;
  
    //print ("reached end of colnedObj") ;
    return newObj; 
}

function destroyObject ( srcObj )
{
    p(" in destroyObject --------- \n");
    for ( var srcProp in srcObj )
    {
        if(srcObj[srcProp] == undefined)
            continue; 

        var a = srcProp + "";         
        pv("\t checking src property - " + a + " type - " + (typeof srcProp) + " is instruction - " + (srcProp == "nextInstruction"));
        if(("" + srcProp) != "nextInstruction")
            continue;    
            
        t = typeof srcObj[srcProp];
        
        if(t != "function" && t == "object")
        { 
            if ( srcObj[srcProp] != null)
            {
               //destroyObject ( srcObj[srcProp] );
               p(" deleting - " + srcProp);
               delete srcObj[srcProp];
               srcObj[srcProp] = null; 
            }
        }
        else
        {
            p(" deleting next instruction - " + srcObj[srcProp]);
            delete srcObj[srcProp];
            srcObj[srcProp] = null; 
        }        
    }
    p(" out of destroyObject --------- \n");    
    return;     
}


var RRIndex = 0 ; 
function ReturnRecord (index, funcName, retValue, pc, actuals)
{
    p ( " creating a new return record with - " + funcName + " " + retValue +  " " + pc );
    this.index = index;
    this.funcName = new String (funcName); 
    this.retValue = retValue; 
    this.condition = new String (pc);     
    this.actuals  = actuals; 
}

function findReturnRecords ( funcName, RRs, actuals)
{
    var matches = new DP_ObCollectionOrdered("index", ReturnRecord); 

    var i = 0; 
    var count = RRs.getCount();
    for ( ; i < count ; i++)
    {
        var mem = RRs.getAt(i);
        if (mem.funcName == funcName && (("" + mem.actuals) == ("" + actuals)))
        {
            matches.add( mem );
            p ( " matching return record #" + mem.index + " \t funcName : " + 
                mem.funcName + " \t returns = " + mem.retValue + 
                " \t pc = " + mem.condition + " \t actuals - " + mem.actuals);
        }
    }
    
    return matches; 
}

function printReturnRecords ( coll )
{
    p ( " printing the return records" );

    var i = 0;     
    var count = coll.getCount();
    for ( ; i < count ; i++){
        var mem = coll.getAt(i);
        p ( " return record #" + mem.index + " \t funcName : " + 
            mem.funcName + " \t returns = " + mem.retValue + 
            " \t pc = " + mem.condition + " \t actuals - " + mem.actuals);
    }
}

function outputJSConstraints ( coll )
{
    p ( " outputting the return records : start" );

//    // open the file that contains JS constraints
//    var filePath = "/tmp/formulas_js.txt";
//    var fh = fopen(filePath, "w"); // Open the file for writing
//    if(fh  == -1) {
//        p( " SEVERE: failed to open the /tmp/formulas_js.txt file for outputting the constraints\n");
//        return;
//    }

    var truePreds = new Array();
    
    var i = 0; 
    var count = coll.getCount();
    for ( ; i < count ; i++)
    {
        var mem = coll.getAt(i);
        if(!mem.retValue)
            continue; 
           
        var predicate = new String(mem.condition);
        predicate = predicate.replace(/_notamper_symbolic/g,'');
 
        p ( " true return from  " + 
            mem.funcName + " \n\t\t condition pc = " + mem.condition + 
            " \n\t\t added predicate - " + predicate);
            
       truePreds.push(predicate);     
    }
    
    var jsConstraints = new String();
    if(truePreds > 1){
        i = 0;
        count = truePreds.length();
        for ( ; i < count ; i++){
            jsConstraints += "(" + truePreds[i] + ")";
        }
        jsConstraints = " AND " + jsConstraints; 
    }else{
        jsConstraints = truePreds[0];
    }
    
	if(jsConstraints != undefined){
    	jsConstraints = " ( " + jsConstraints + " ) ";
    	print("JavaScript evaluator generated these constraints NTBEGIN" + jsConstraints);
    } else { 
		print("JavaScript evaluator generated these constraints NTBEGIN (TRUE)");
	}
//    fwrite(fh, jsConstraints);
//    fflush(fh);
//    fclose(fh);
}

var ReturnRecords = new DP_ObCollectionOrdered("index", ReturnRecord); 
var PendingExecutions = new DP_ObCollectionOrdered ("notamper_index", ExecutionContext);

function executeNextPending (xc)
{
    destroyObject(xc);
    p ( " calling executeNextPending - ");
    if ( ! PendingExecutions.isEmpty() )
    {
        var mem = PendingExecutions.getAt(0);
        PendingExecutions.drop ( mem.notamper_index );
//        p ( " \t now executing - " + mem);
        ExecutionContext.current = mem;
        
//            this.programCondition = "true"; 
//    this.calledExecutionContext_programCondition = "";

        p ( " Printing insts to be executed in the pending xc (PC : " + mem.programCondition + ") : ");
        var inst = mem.nextInstruction; 
        var last = inst;
        while ( inst != null)
        {
            p ( " \t inst - " + getNodeType (inst));
            execute ( inst, mem ) ; 
            last = inst; 

            next = inst.nextInstruction;
			p (" executed now - " + getNodeType(inst));
        	if(next == null && getNodeType(inst) == "IF"){
				if(inst.thenPart[1] != undefined)
					inst = inst.thenPart[1].nextInstruction; 
				else
					inst = inst.nextInstruction; 
				p(" in if - next - " + getNodeType(inst));
			} else { 
				inst = next; 
			}
		}
        
        var x = ExecutionContext.current;
        p1(TMP_DEBUG, " Last instruction executed in function  - " + 
            mem.funcName + " inst - " + last + " programCondition - " + x.programCondition);
        
        var lastInst = "" + last; 
        // check if, we executed a function and the last instruction is not a 
        // return statement. if we were executing this function symbolically we 
        // should add a true return record as by default the event handlers are 
        // assumed to return true values.

        if( mem.funcName.indexOf("onSubmit") != -1 && 
            lastInst.indexOf("type: RETURN") == -1 && 
            x.programCondition.indexOf("notamper_symbolic") != -1){

            var crntFn = x.callee; 
            var callerFn = x.caller; 
            p ( " current function node - " + crntFn + " caller - " + callerFn);
            var formals = crntFn.node.params;
            var actuals = [];
            if ( formals != null )
            {
                p ( " \t\t formals - " + formals);
                for ( var i = 0 ; i < formals.length ; i++)
                {
                    var t = "" + formals[i];
                    p ( " \t\t\t formal : " + t + " actual - " + x.scope.object[t]);
                    actuals[i] = x.scope.object[t];
                }
            }
            // default return is true
            var rr = new ReturnRecord ( RRIndex++ , mem.funcName, true, x.programCondition, actuals);
            p ( " adding a return record #" + rr.index +" \t funcName : " + rr.funcName + 
                " \t returns = " + rr.retValue + " \t pc = " + rr.condition);

            ReturnRecords.add( rr );
        }
    }
}


function printPendingExecutions ( coll )
{
    p ( " Printing the pending executions ");
    var count = coll.getCount (); 
    var i = 0; 
    for ( ; i < count ; i ++)
    {
        var mem = coll.getAt(i);
//        p ( " pending# " + i + " next instruct - " + 
//            (mem.nextInstruction == null ? " null" : mem.nextInstruction));
        p ( " pending# " + i + " PC - " + mem.programCondition);
        //printXC ( mem );
    }
}

// For evaluating ORed/ANDed conditions. 
// basically this data structures enables following symbolic evaluation
// if ( c1 OR c2 OR c3) then x1 else x2; 
// TRUE: c1
// TRUE: NOT c1 AND c2
// TRUE: NOT c1 AND NOT c2 AND c3 
// FALSE: NOT c1 AND NOT c2 AND NOT c3
// and fork the execution of true branch for first three with next instruction
// being the body of the then block and false branch with the rest.    
var conditionIndex = 0;
var conditionCases = new DP_ObCollectionOrdered("index", ConditionRecord); 
function ConditionRecord (index, boolValue, pc)
{
    p ( " Creating a new condition record with - " + index + " value - " + 
        (boolValue ? "T" : "F") +  " pc - " + pc);
    
    this.index = index;
    this.boolValue = boolValue; 
    this.condition = new String (pc);     
    this.processed  = false; 
    this.nextInstruction = null; 
    this.nestingDepth = clauseCounter;
}


function freeConditionRecords(CCs)
{
    var i = 0; 
    var count = CCs.getCount();
    for ( ; i < count ; i++)
    {
        var mem = CCs.getAt(i);
        p ( " Condition Case #" + mem.index + 
            "    depth: " + mem.nestingDepth +
            " val : " + (mem.boolValue ? "T" : "F") + 
            " pro - " + (mem.processed ? "T" : "F") +
            " pc = " + mem.condition); 
        delete mem.index;  
        delete mem.nestingDepth; 
        delete mem.boolValue; 
        delete mem.processed; 
        delete mem.condition; 
        delete mem; 
        mem = null; 
    }
    
    CCs.clear();
}


function printConditionRecords(CCs)
{
    var i = 0; 
    var count = CCs.getCount();
    p (" ========= current clause level - " + clauseCounter);
    for ( ; i < count ; i++)
    {
        var mem = CCs.getAt(i);
        p ( " Condition Case #" + mem.index + 
            "    depth: " + mem.nestingDepth +
            " val : " + (mem.boolValue ? "T" : "F") + 
            " pro - " + (mem.processed ? "T" : "F") +
            " pc = " + mem.condition); 

    }
}

function isBooleanReturn(id, body){   
    var id1 = "" + id; 
     
//    if(id1.indexOf("onSubmit_") != -1)
//        return true; 
        
    if(id1 == "DOM"  || id1 == "WINDOW"){
        return true; 
    }     

    var body = "" + body; 
    if(body.indexOf("return ") == -1){
        p(" No return instruction in  " + id1);
        return false; 
    }    
    
    return true; 
}

function addRecordIfAbsent (condition, CCs){
    if(!isSymbolic(condition))
        return;
        
//    p("\t\t testing if condition is present - " + condition);
    var count = CCs.getCount();
    var i = 0;
    for ( ; i < count ; i++)
    {
        var mem = CCs.getAt(i);
        var str = mem.boolValue + " \t pc = " + mem.condition;
  //      p (" \t\t\t matching against - "  + str);
        if(str.indexOf(condition) != -1)
            return;
    }

    //p("\t\t adding two more conditions - ");
    //var falseCondition = " NOT ( " + condition + " ) ";
    conditionCases.add(new ConditionRecord(conditionIndex++, true, condition));
//    conditionCases.add(new ConditionRecord(conditionIndex++, false, falseCondition));
}


function getCondition(n, x, bOR){
    p1(TMP_DEBUG, "Called getCondition for - " + (bOR? "OR" : "AND"));
  printConditionRecords(conditionCases);
   
   	p ( " clause counter - " + clauseCounter); 
    ++clauseCounter;
    var strNodeType = bOR ? "OR": "AND";  
    var condition = "";
    var vlClause = getValue (execute(n[0], x));   
    var vrClause = getValue (execute(n[1], x));
    p1(TMP_DEBUG, " vlClause =  " + vlClause + " vrClause = " + vrClause);    
    var symb = false; 
    if (isSymbolic(vlClause) || isSymbolic(vrClause)){
        //condition = vlClause + " " + strNodeType + " " + vrClause;
        condition = strNodeType + "(" + vlClause + ") (" + vrClause + ")";
    }
    else{
        if(bOR)
            condition = (vlClause || vrClause);
        else
            condition = (vlClause && vrClause);
    }

    p1(TMP_DEBUG, " For condition - " + n.condition + " returned - " + condition);
    return condition;
}

function negateThisCondition ( condition ){
    var negated = "";
    
    // if condition = NOT ( x )
    //  return x
    // else, return NOT ( condition );

    var tmpStr = new String(condition);
    tmpStr = tmpStr.toLowerCase();
    tmpStr = tmpStr.replace(/ /g,'');
    var len = tmpStr.length; 
    p1 (TMP_DEBUG, " original condition - " + condition + 
        " space stripped -|" + tmpStr + "|");
    if(tmpStr.charAt(0) == 'n' && 
        tmpStr.charAt(1) == 'o' && 
        tmpStr.charAt(2) == 't' && 
        tmpStr.charAt(3) == '('  && 
        tmpStr.charAt(len - 1) == ')')
        {
        // skip the first NOT (
        var begin = condition.indexOf("NOT (")  + "NOT (".length;
        
        var end = begin + condition.length - "NOT (".length - 1; 
        // and skip last 1 char
        negated = condition.substring(begin, end).replace(/^\s+|\s+$/g,"");
    }
    else{
        negated = "NOT (" + condition.replace(/^\s+|\s+$/g,"") + ")" ;
	}

    p1(TMP_DEBUG, "negateThisCondition: Produced negation as - " + negated + 
        " for condition - " + condition);
        
    return negated;  
}

/* Application customizations to enable working with Narcissus-- 
    
    1 PHPNUKE: disabled download of tinyMCE and formula extractor includes a 
        custom tinyMCE - narcissus hangs otherwise. 
        
    2. snipegallery : bug fix to be done 
        --- temporarily added an explicit "return true" in the function 
        validateForm();

        admin/lib/forms/cat_form.php
        and 
        admin/lib/forms/frame_form.php



    Note: too much recursion problem was overcome by recompiling libmozjs.so 
    library file. 
    
    modified 
        jsinterp.cpp:#define MAX_INLINE_CALL_COUNT 12000

    rebuiling only succeeded on 32 bit DELL laptop
    --> need to build mozilla on 64 :|
    

    3. dcp portal 
    -- has the problem in htmlparser 
    <script>
    editor.surroundHTML('<span style="background-color: yellow">', '</span>');
    </script>
    the </span> seem to end the <script> tag. hence the script body returned by 
    the HTMLParser is 
    editor.surroundHTML('<span style="background-color: yellow">', '
    
    which is malformed. 
    
    so commented out this line from themes/dcp-portal/theme.htm
                
    similar scripts removed from library/lib_mods.php
    
    in admin/inc/header.inc.php            
       changed <-- Begin to <-- // Begin 
       
                
/************************************************************* notamper end **/



