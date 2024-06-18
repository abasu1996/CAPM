
service say @(requires: 'authenticated-user'){
  action upload @(requires:'Admin')() returns String;
}