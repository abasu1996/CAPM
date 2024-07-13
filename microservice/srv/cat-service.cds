service customservice @(path:'/v2api'){//@(requires: 'authenticated-user') {

    action customer() returns String;
    action aynccustomer() returns String;
    action opportunity() returns String;
    action lead() returns String;
    action appointment() returns String;
    action quote() returns String;
}