
service generateDocument {

   function generate(parameters:String) returns String;
   @open
   type AnyJson {};
   
   action combinedDocGenerate(value:AnyJson) returns String;
   function getDocumentCreated(params:String) returns String;
}
annotate generateDocument with @cds.server.body_parser.limit: '1mb';