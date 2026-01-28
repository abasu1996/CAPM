namespace ns.beginner;
entity Books {
  key ID     : UUID;
  @Search.searchable: true
  @Search.defaultSearchElement: true
      title  : String;
      author : String;
      stock  : Integer;
}

annotate Books with @(
    UI.LineItem:[
        {Value:title, Label:'Title',@UI.Importance:#High},
        {Value:author, Label:'Author Name'},
        {Value:stock, Label:'Stock'}
    ],
    UI.Identification:[
        {Value:author}
    ],
    UI.SelectionFields : [author]
    ,
    
);

