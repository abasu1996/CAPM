using {
  managed,
  sap
} from '@sap/cds/common';

namespace sap.capire.bookshop;

entity Books {
  key ID     : Integer;
      title  : String;
      stock  : Integer;
      author : Association to Authors;
      genre  : Association to Genres;
}

entity Authors {
  key ID    : Integer;
      name  : String;
      books : Association to many Books
                on books.author = $self;
}

entity Genres : sap.common.CodeList {
  key ID : Integer;
}