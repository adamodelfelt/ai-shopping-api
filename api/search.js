import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { scoreAndSortProducts } from '../lib/scoreProducts.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const CATEGORY_MAP = {
  jacket: 'jacket',
  jackets: 'jacket',
  shell: 'jacket',
  rainwear: 'jacket',
  pants: 'pants',
  trousers: 'pants',
  jeans: 'jeans',
  sweater: 'sweater',
  knitwear: 'sweater',
  shoes: 'shoes',
  shoe: 'shoes',
  hat: 'hat',
  hats: 'hat',
  overall: 'overall',
  overalls: 'overall',
  accessories: 'accessories',
  accessory: 'accessories',
  fleece: 'fleece'
}

const SUBCATEGORY_RULES = [
  { match: ['shell jacket', 'shelljacket', 'skaljacka'], value: 'shell_jacket' },
  { match: ['rain jacket', 'raincoat', 'regnjacka'], value: 'rain_jacket' },
  { match: ['winter jacket', 'vinterjacka'], value: 'winter_jacket' },
  { match: ['softshell', 'softshell jacket', 'softshelljacka'], value: 'softshell_jacket' },
  { match: ['pile fleece', 'pilefleece'], value: 'pile_fleece' },
  { match: ['fleece'], value: 'fleece' }
]

const COLOR_RULES = [
  { match: ['black', 'svart'], value: 'black' },
  { match: ['blue', 'blå'], value: 'blue' },
  { match: ['navy', 'mörkblå', 'dark blue'], value: 'navy' },
  { match: ['red', 'röd'], value: 'red' },
  { match: ['green', 'grön'], value: 'green' },
  { match: ['beige'], value: 'beige' },
  { match: ['pink', 'rosa'], value: 'pink' },
  { match: ['grey', 'gray', 'grå'], value: 'grey' },
  { match: ['yellow', 'gul'], value: 'yellow' },
  { match: ['purple', 'lila'], value: 'purple' },
  { match: ['white', 'vit'], value: 'white' }
]

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
}

function safeParseFilters(content) {
  try {
    const parsed = JSON.parse(content)

    return {
      category: parsed.category ?? null,
      subcategory: parsed.subcategory ?? null,
      color: parsed.color ?? null,
      style: parsed.style ?? null
    }
  } catch {
    return {
      category: null,
      subcategory: null,
      color: null,
      style: null
    }
  }
}

function findRuleValue(query, rules) {
  const q = normalize(query)

  for (const rule of rules) {
    if (rule.match.some((term) => q.includes(normalize(term)))) {
      return rule.value
    }
  }

  return null
}

function findCategoryFromQuery(query) {
  const q = normalize(query)

  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (q.includes(normalize(key))) {
      return value
    }
  }

  return null
}

function normalizeFilters(aiFilters, query) {
  const ruleCategory = findCategoryFromQuery(query)
  const ruleSubcategory = findRuleValue(query, SUBCATEGORY_RULES)
  const ruleColor = findRuleValue(query, COLOR_RULES)

  const category = aiFilters.category
    ? CATEGORY_MAP[normalize(aiFilters.category)] ?? normalize(aiFilters.category)
    : ruleCategory

  const subcategory = aiFilters.subcategory
    ? normalize(aiFilters.subcategory)
    : ruleSubcategory

  const color = aiFilters.color
    ? normalize(aiFilters.color)
    : ruleColor

  const style = aiFilters.style ? normalize(aiFilters.style) : null

  return {
    category: category ?? null,
    subcategory: subcategory ?? null,
    color: color ?? null,
    style
  }
}

function applyFilters(dbQuery, filters, options = {}) {
  const { includeSubcategory = true, includeColor = true, includeCategory = true } = options

  let query = dbQuery

  if (includeCategory && filters.category) {
    query = query.ilike('category', `%${filters.category}%`)
  }

  if (includeSubcategory && filters.subcategory) {
    query = query.eq('subcategory', filters.subcategory)
  }

  if (includeColor && filters.color) {
    query = query.eq('color', filters.color)
  }

  return query
}

async function runProductQuery(filters, options = {}) {
  let dbQuery = supabase
    .from('products')
    .select('*')
    .eq('in_stock', true)
    .limit(100)

  dbQuery = applyFilters(dbQuery, filters, options)

  const result = await dbQuery

  if (result.error) throw result.error
  return result.data || []
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query } = req.body || {}

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'Missing query' })
    }

    const userQuery = String(query).trim()

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `
Extract shopping intent from the user's clothing search.

Return valid JSON with these keys:
- category
- subcategory
- color
- style

Rules:
- Use English values
- category should be a broad product type like:
  jacket, pants, jeans, sweater, shoes, hat, overall, accessories, fleece
- subcategory should be more specific when possible, for example:
  shell_jacket, rain_jacket, winter_jacket, fleece, pile_fleece, softshell_jacket
- color should be a normalized color like:
  black, blue, navy, red, green, beige, pink, grey, yellow, purple, white
- style can be null if not clearly stated
- if unknown, use null
- do not invent details
          `
        },
        {
          role: 'user',
          content: userQuery
        }
      ]
    })

    const aiFilters = safeParseFilters(aiResponse.choices[0].message.content)
    const filters = normalizeFilters(aiFilters, userQuery)

    let products = await runProductQuery(filters, {
      includeCategory: true,
      includeSubcategory: true,
      includeColor: true
    })

    let fallbackLevel = 'strict'

    if (!products.length) {
      products = await runProductQuery(filters, {
        includeCategory: true,
        includeSubcategory: false,
        includeColor: true
      })
      fallbackLevel = 'without_subcategory'
    }

    if (!products.length) {
      products = await runProductQuery(filters, {
        includeCategory: true,
        includeSubcategory: false,
        includeColor: false
      })
      fallbackLevel = 'category_only'
    }

    if (!products.length) {
      products = await runProductQuery(
        { category: null, subcategory: null, color: null, style: null },
        {
          includeCategory: false,
          includeSubcategory: false,
          includeColor: false
        }
      )
      fallbackLevel = 'all_in_stock'
    }

    const rankedProducts = scoreAndSortProducts(products, filters, userQuery).slice(0, 4)

    const mappedProducts = rankedProducts.map((product) => ({
      id: String(product.id),
      name: product.name,
      price: product.price_sek ?? 0,
      store: product.retailer ?? product.brand ?? 'Store',
      image: product.image_url ?? '',
      color: product.color ?? '',
      eco: Boolean(product.eco),
      url: product.product_url ?? '',
      score: product._score ?? 0
    }))

    return res.status(200).json({
      filters,
      debug: {
        fallbackLevel,
        totalCandidates: products.length
      },
      groups: [
        {
          category: 'Top picks',
          products: mappedProducts
        }
      ]
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      error: 'Something went wrong',
      details: err?.message ?? 'Unknown error'
    })
  }
}
