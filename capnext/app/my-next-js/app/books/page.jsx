async function getBooks() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/books`, {
    cache: 'no-store',
  });
  if (!res.ok) console.log('Failed to load books');

  return res.json();
}

export default async function BooksPage() {
  const books = await getBooks();

  return (
    <main style={{ padding: '1rem' }}>
      <h1>Books from CAP</h1>
      <ul>
        {books.map((b) => (
          <li key={b.ID}>
            {b.title} – {b.author} ({b.stock} in stock)
          </li>
        ))}
      </ul>
    </main>
  );
}
