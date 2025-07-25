import React, { useEffect, useState } from 'react';

const NewsComponent = () => {
  const [news, setNews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/odata/v4/catalog/Books')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch News');
        return res.json();
      })
      .then((data) => setNews(data.value))
      .catch((err) => setError(err.message));
  }, []);

  /* format the date to YYYY-MM-DD */
  const formatDate = (fetchedDate) => {
    if (!fetchedDate) return '';
    const date = new Date(fetchedDate);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>News Feed</h2>
      {error ? (
        <p style={{ color: 'red' }}>Error: {error}</p>
      ) : news.length === 0 ? (
        <p>Getting the news...</p>
      ) : (
        <table border="1" cellPadding="8" cellSpacing="0">
          <thead>
            <tr>
              <th>News Title</th>
              <th>News Body</th>
              <th>Edited At</th>
            </tr>
          </thead>
          <tbody>
            {news.map((item) => (
              <tr key={item.ID}>
                <td>{item.news_title}</td>
                <td>{item.news_body}</td>
                <td>{formatDate(item.editedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default NewsComponent;