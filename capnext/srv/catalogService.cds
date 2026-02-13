using { bookshop.db as bdb} from '../db/schema';
service CatalogService {
    entity Books as projection on bdb.Books;
}