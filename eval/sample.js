
function DOM (){
    var email1 = new Object; 
    email1.value = 'email1_notamper_symbolic'; 
    var form1 = new Object; 
    form1.email1 = email1; 
    var forms = []; 
    forms.form1 = form1; 
    this.forms = forms;
} 

var document = new DOM (); 
notamper_execution_begins = 'true'; 

function isValid (e1, e2) { 
    var e = document.forms['form1'].email1.value; 
    var returnValue = true; 
    
    if (e < 'aa' || e >= 'bb' || e > 'cc') 
        returnValue = false; 
    else 
        returnValue = true; 
    
    return returnValue; 
} 

function onSubmit_form1 () { 
    var ret_onSubmit_form1 = false; 
    ret_onSubmit_form1 = isValid('email1', 'email2'); 
    return ret_onSubmit_form1 ; 
}  
    
onSubmit_form1(); 
notamper_execution_ends = 'true';

