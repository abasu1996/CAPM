//Path registered to avoid confusion

service say@(path: '/')@(requires: 'authenticated-user'){
  action upload() returns String;
  action customer() returns String;
  action lead() returns String;
  action opportunity() returns String;
  action quote() returns String;

}