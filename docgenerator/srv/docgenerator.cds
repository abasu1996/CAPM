service generateDocument {

   function generate() returns String;

   action helper(input:String) returns String;
   function getDocumentCreated(params:String) returns String;
}