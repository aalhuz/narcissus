function DOM()
    {
    var postmodify = new Object; 
    var forms = [];
    
    forms.postmodify = postmodify; 
    this.forms = forms; 

    var to = new Object; 
    to.value = "to_notamper_symbolic";    
    postmodify.to = to;         
        
    var bcc = new Object; 
    bcc.value = "bcc_notamper_symbolic";    
    postmodify.bcc = bcc;         
            
    var subject = new Object; 
    subject.value = "subject_notamper_symbolic";    
    postmodify.subject = subject;         
    
    var message = new Object; 
    message.value = "message_notamper_symbolic";    
    postmodify.message = message;
    
    var elements = [];
    elements["to"] = to;
    elements["bcc"] = bcc;
    elements["subject"] = subject; 
    elements["message"] = message; 
    
    postmodify.elements = elements;          
}
var document = new DOM();
notamper_execution_begins = 'true';

var smf_formSubmitted = false;

function submitonce(theform)
{
    smf_formSubmitted = true;
}

function saveEntities()
{
	var textFields = ["subject", "message"];
	for (i in textFields)
		if (document.forms.postmodify.elements[textFields[i]])
			document.forms.postmodify[textFields[i]].value = document.forms.postmodify[textFields[i]].value.replace(/&#/g, "&#38;#");
}

function onsubmit_postmodify()
{
    submitonce(document.forms.postmodify);
    saveEntities();
}

onsubmit_postmodify();
    
notamper_execution_ends = 'true';
