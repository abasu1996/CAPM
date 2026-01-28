const cds = require('@sap/cds');

module.exports = cds.service.impl(async function() {

  this.on('getRecommendations', async (req) => {
    const { genre, limit } = req.data;

    // Query books by genre
    const books = await SELECT.from('my.bookshop.Books')
      .where({ genre: genre, stock: { '>': 0 } })
      .limit(limit || 5);

    // Return titles
    return books.map(b => b.title);
  });

  this.on('checkAvailability', async (req) => {
    const { bookId } = req.data;

    // Get book stock
    const book = await SELECT.one.from('my.bookshop.Books')
      .where({ ID: bookId });

    // Return availability
    return book && book.stock > 0;
  });
});
