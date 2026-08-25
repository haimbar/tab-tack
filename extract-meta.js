(() => {
  function getMeta(names) {
    for (const name of names) {
      const el =
        document.querySelector(`meta[name="${name}"]`) ||
        document.querySelector(`meta[property="${name}"]`);
      if (el && el.content) return el.content.trim();
    }
    return "";
  }

  return {
    author: getMeta([
      "author",
      "article:author",
      "byl",
      "dc.creator",
      "citation_author",
      "twitter:creator"
    ]),
    date: getMeta([
      "article:published_time",
      "date",
      "dc.date.issued",
      "dc.date",
      "citation_publication_date",
      "datePublished"
    ])
  };
})();
