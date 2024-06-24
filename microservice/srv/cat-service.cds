//Path registered to avoid confusion
//@(requires: 'authenticated-user')
service say@(path: '/'){
  action upload() returns String;
  action customer() returns String;
  action lead() returns String;
  action opportunity() returns String;
  action quote() returns String;

}