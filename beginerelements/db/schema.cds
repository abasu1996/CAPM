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
    UI.HeaderInfo: {
        TypeName      : 'Book',
        TypeNamePlural: 'Books',
        Title         : {Value: title},
        Description   : {Value: author}
    },
    UI.LineItem:[
        {Value:title, Label:'Title',@UI.Importance:#High},
        {Value:author, Label:'Author Name'},
        {Value:stock, Label:'Stock'}
    ],
    UI.Identification:[
        {Value:title, Label:'Title'},
        {Value:author, Label:'Author'},
        {Value:stock, Label:'Stock'}
    ],
    UI.SelectionFields : [title, author]
);
