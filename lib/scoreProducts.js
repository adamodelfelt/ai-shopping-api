function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
}

function includesNormalized(fieldValue, filterValue) {
  const field = normalize(fieldValue)
  const filter = normalize(filterValue)

  if (!field || !filter) return false
  return field.includes(filter)
}

function getTokens(text) {
  return normalize(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function getTextMatchScore(product, query) {
  const queryTokens = getTokens(query)

  if (!queryTokens.length) return 0

  const haystack = [
    product.name,
    product.category,
    product.subcategory,
    product.color,
    product.material,
    product.brand,
    product.retailer
  ]
    .map(normalize)
    .join(' ')

  if (!haystack) return 0

  let matches = 0

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      matches += 1
    }
  }

  return Math.min(matches * 8, 24)
}

function getSubcategoryScore(product, filters) {
  if (!filters.subcategory) return 0
  return normalize(product.subcategory) === normalize(filters.subcategory) ? 100 : 0
}

function getCategoryScore(product, filters) {
  if (!filters.category) return 0
  return includesNormalized(product.category, filters.category) ? 50 : 0
}

function getColorScore(product, filters) {
  if (!filters.color) return 0
  return normalize(product.color) === normalize(filters.color) ? 40 : 0
}

function getEcoBoost(product) {
  return product.eco === true ? 20 : 0
}

function getInStockBoost(product) {
  return product.in_stock === true ? 5 : 0
}

function getPriceValue(product) {
  const price = Number(product.price_sek)
  return Number.isFinite(price) ? price : Number.MAX_SAFE_INTEGER
}

export function scoreProduct(product, filters, query) {
  const subcategoryScore = getSubcategoryScore(product, filters)
  const categoryScore = getCategoryScore(product, filters)
  const colorScore = getColorScore(product, filters)
  const textMatchScore = getTextMatchScore(product, query)
  const ecoBoost = getEcoBoost(product)
  const inStockBoost = getInStockBoost(product)

  const totalScore =
    subcategoryScore +
    categoryScore +
    colorScore +
    textMatchScore +
    ecoBoost +
    inStockBoost

  return {
    ...product,
    _score: totalScore,
    _scoreBreakdown: {
      subcategoryScore,
      categoryScore,
      colorScore,
      textMatchScore,
      ecoBoost,
      inStockBoost
    }
  }
}

export function scoreAndSortProducts(products, filters, query) {
  return [...products]
    .map((product) => scoreProduct(product, filters, query))
    .sort((a, b) => {
      if (b._score !== a._score) {
        return b._score - a._score
      }

      if (a.eco !== b.eco) {
        return Number(b.eco === true) - Number(a.eco === true)
      }

      return getPriceValue(a) - getPriceValue(b)
    })
}
