
service generateDocument {

   function generate(parameters:String) returns String;
   @open
   type AnyJson {};
   
   action combinedDocGenerate(docpayload:AnyJson) returns String;
   function getDocumentCreated(params:String) returns String;
}