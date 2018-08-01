function alert(){}
function DOM()
{
    var forms = [];
    var form1 = new Object; 
    forms.form1 = form1;
    this.forms = forms; 

    var expires_one_day = new Object; 
    expires_one_day.checked = "expiration_notamper_symbolic==\"one_day\"";
    form1.expires_one_day = expires_one_day; 
    
    var already_expired = new Object; 
    already_expired.checked = "expiration_notamper_symbolic==\"expired\""        
    form1.already_expired = already_expired;
    
    var reason = new Object; 
    reason.value = "reason_notamper_symbolic";
    form1.reason  =  reason;
    
    var notes = new Object;
    notes.value = "notes_notamper_symbolic";
    form1.notes = notes;
    
    var full_ban = new Object; 
    full_ban.checked = "full_ban_notamper_symbolic == 1";
    form1.full_ban = full_ban;
    
    var partial_ban = new Object; 
    partial_ban.checked = "full_ban_notamper_symbolic == 0";
    form1.partial_ban = partial_ban;
    
    var cannot_post = new Object; 
    cannot_post.checked = "cannot_post_notamper_symbolic == 1"
    form1.cannot_post = cannot_post;
     
    var cannot_register = new Object;
    cannot_register.checked = "cannot_register_notamper_symbolic == 1";
    form1.cannot_register = cannot_register;
    
    var cannot_login = new Object; 
    cannot_login.checked = "cannot_login_notamper_symbolic == 1";
    form1.cannot_login = cannot_login;
    
    var main_ip = new Object; 
    main_ip.value = "main_ip_notamper_symbolic" ;
    form1.main_ip = main_ip;
    
    var ban_suggestion = new Array();

    var main_ip_check = new Object;
    main_ip_check.checked = "ban_suggestion[0]_notamper_symbolic";
    ban_suggestion[0] = main_ip_check; 
    form1.main_ip_check = main_ip_check;
    
    var hostname_check = new Object; 
    hostname_check.checked = "ban_suggestion[1]_notamper_symbolic == 1";
    ban_suggestion[1] = hostname_check;
    form1.hostname_check = hostname_check;
    
    var email_check = new Object; 
    email_check.checked = "ban_suggestion[2]_notamper_symbolic == 1";
    ban_suggestion[2] = email_check;
    form1.email_check = email_check;
    
    var user_check = new Object; 
    user_check.checked = "ban_suggestion[3]_notamper_symbolic == 1";
    ban_suggestion[3] = user_check;
    form1.ban_suggestion = ban_suggestion;
    form1.user_check = user_check ;
    
    var user = new Object; 
    user.value = "user_notamper_symbolic";
    form1.user = user;
    
    var ban_name = new Object; 
    ban_name.value = "ban_name_notamper_symbolic";
    form1.ban_name = ban_name; 
    
    // hidden values: 
    // old_expire  == "0"
    // bg == "0"
    // sc == "704e01bb810c192d4dba4541aa99f582"
}

var document = new DOM();

notamper_execution_begins = 'true'; 

onsubmit_();
function onsubmit_()
{
    var form1 = document.forms.form1;
    
    if (form1.ban_name.value == '') {
        //alert('The name of the ban was left empty'); 
        return false;
    } 
    
    if (form1.partial_ban.checked && !(form1.cannot_post.checked || form1.cannot_register.checked || form1.cannot_login.checked)) {
            //alert('No restriction selected.'); 
            return false;
        }
    //}
    
    return true; 
}
notamper_execution_ends = 'true';

