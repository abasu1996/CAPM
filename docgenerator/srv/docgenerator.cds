service generateDocument {

   function generate() returns String;

   action getDocumentCreated(input:String) returns String;
   function helper(params:String) returns String;
}