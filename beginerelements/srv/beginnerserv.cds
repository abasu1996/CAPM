using { ns.beginner as bg } from '../db/schema';

service BeginnerService {

    entity Books as projection on bg.Books;

}