using {sap.capire.bookshop as my} from '../db/schema';

service CatalogService {

  @mcp: {
    name       : 'books',
    description: 'Book data list',
    resource   : true
  }
  entity Books   as projection on my.Books;

  annotate CatalogService.Books with @mcp.wrap: {
    tools: true,
    modes: [
      'query',
      'get',
    ],
    hint : 'Use for read and write operations related to books'
  };

  extend projection Books with actions {
    @mcp: {
      name       : 'get-stock',
      description: 'Gets the stock of a certain book',
      tool       : true
    }
    function getStock() returns Integer;
  }

  entity Authors as projection on my.Authors;
  entity Genres  as projection on my.Genres;

  @mcp: {
    name       : 'get-book-recommendation',
    description: 'Gets a random book recommendation',
    tool       : true
  }
  function getBookRecommendation() returns String;

  action   submitOrder(book : Books:ID @mandatory,
                       quantity : Integer @mandatory
  )                                returns {
    stock : Integer
  };

  event OrderedBook : {
    book     : Books:ID;
    quantity : Integer;
    buyer    : String
  };
}

annotate CatalogService with @mcp.prompts: [{
  name       : 'give-me-book-abstract',
  title      : 'Book Abstract',
  description: 'Gives an abstract of a book based on the title',
  template   : 'Search the internet and give me an abstract of the book {{book-id}}',
  role       : 'user',
  inputs     : [{
    key : 'book-id',
    type: 'String'
  }]
}];