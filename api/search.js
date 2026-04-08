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
  pants: 'pants',
  trousers: 'pants',
  jeans: 'pants',
  fleece: 'fleece',
  fleeces: 'fleece',
  overall: 'overall',
  overalls: 'overall',
  accessories: 'accessories',
  accessory: 'accessories',
  hat: 'accessories',
  hats: 'accessories'
}

const SUBCATEGORY_RULES = [
  { match: ['shell jacket', 'shelljacket', 'skaljacka'], value: 'shell_jacket' },
  { match: ['rain jacket', 'raincoat', 'regnjacka'], value: 'rain_jacket' },
  { match: ['winter jacket', 'vinterjacka'], value: 'winter_jacket' },
  { match: ['softshell', 'softshell jacket', 'softshelljacka'], value: 'softshell_jacket' },
  { match: ['puffer', 'puffer jacket', 'dunjacka'], value: 'puffer_jacket' },
  { match: ['pile fleece', 'pilefleece'], value: 'pile_fleece' },
  { match: ['fleece'], value: 'fleece' }
]

const COLOR_RULES = [
  { match: ['black', 'svart'], value: 'black' },
  { match: ['navy', 'mörkblå', 'dark blue'], value: 'navy' },
  { match: ['blue', 'blå'], value: 'blue' },
  { match: ['green', 'grön', 'gröna', 'grönt'], value: 'green' },
  { match: ['red', 'röd', 'röda'], value: 'red' },
  { match: ['beige'], value: 'beige' },
  { match: ['pink', 'rosa'], value: 'pink' },
  { match: ['grey', 'gray', 'grå'], value: 'grey' },
  { match: ['yellow', 'gul'], value: 'yellow' },
  { match: ['purple', 'lila'], value: 'purple' },
  { match: ['white', 'vit'], value: 'white' }
]

const ALLOWED_COLORS = new Set([
  'black',
  'navy',
  'blue',
  'green',
  'red',
  'beige',
  'pink',
  'grey',
  'yellow',
  'purple',
  'white'
])

function normalize(value) {
  return String(value ?? '').toLowerCase().trim()
}

function titleCase(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function safeParseJson(content) {
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function safeParseFilters(content) {
  const parsed = safeParseJson(content)

  if (!parsed) {
    return {
      category: null,
      subcategory: null,
      color: null,
      style: null
    }
  }

  return {
    category: parsed.category ?? null,
    subcategory: parsed.subcategory ?? null,
    color: parsed.color ?? null,
    style: parsed.style ?? null
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

function cleanColor(color) {
  const c = normalize(color)

  if (!c) return null
  if (ALLOWED_COLORS.has(c)) return c

  const firstWord = c.split(/\s+/)[0]
  if (ALLOWED_COLORS.has(firstWord)) return firstWord

  return null
}

function normalizeFilters(aiFilters, query) {
  const ruleCategory = findCategoryFromQuery(query)
  const ruleSubcategory = findRuleValue(query, SUBCATEGORY_RULES)
  const ruleColor = findRuleValue(query, COLOR_RULES)

  const aiCategory = aiFilters.category
    ? CATEGORY_MAP[normalize(aiFilters.category)] ?? normalize(aiFilters.category)
    : null

  const aiSubcategory = aiFilters.subcategory
    ? normalize(aiFilters.subcategory)
    : null

  const aiColor = cleanColor(aiFilters.color)

  return {
    category: ruleCategory || aiCategory || null,
    subcategory: ruleSubcategory || aiSubcategory || null,
    color: ruleColor || aiColor || null,
    style: aiFilters.style ? normalize(aiFilters.style) : null
  }
}

function splitIntoSearchParts(query) {
  return query
    .split(/\s+och\s+|,|\s+\+\s+|\s+plus\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function buildGroupLabel(part, filters) {
  const pieces = []

  if (filters.color) pieces.push(titleCase(filters.color))
  if (filters.subcategory) {
    pieces.push(titleCase(filters.subcategory.replaceAll('_', ' ')))
  } else if (filters.category) {
    pieces.push(titleCase(filters.category))
  } else {
    pieces.push(titleCase(part))
  }

  return pieces.join(' ')
}

function applyFilters(dbQuery, filters, options = {}) {
  const {
    includeCategory = true,
    includeSubcategory = true,
    includeColor = true
  } = options

  let query = dbQuery

  if (includeCategory && filters.category) {
    query = query.eq('category', filters.category)
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

async function parseSinglePart(part) {
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
- category should be one of:
  jacket, fleece, pants, overall, accessories
- subcategory should be more specific when possible, for example:
  shell_jacket, rain_jacket, winter_jacket, fleece, pile_fleece, softshell_jacket, puffer_jacket
- color should be one normalized value only:
  black, blue, navy, red, green, beige, pink, grey, yellow, purple, white
- style can be null if not clearly stated
- if unknown, use null
- do not include extra words in color
- do not invent details
        `
      },
      {
        role: 'user',
        content: part
      }
    ]
  })

  const aiFilters = safeParseFilters(aiResponse.choices[0].message.content)
  const filters = normalizeFilters(aiFilters, part)

  return {
    part,
    aiFilters,
    filters
  }
}

async function searchOnePart(part) {
  const parsed = await parseSinglePart(part)
  const { filters } = parsed

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

  if (!products.length && !filters.color) {
    products = await runProductQuery(filters, {
      includeCategory: true,
      includeSubcategory: false,
      includeColor: false
    })
    fallbackLevel = 'category_only'
  }

  if (!products.length && !filters.color && !filters.category) {
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

  const rankedProducts = scoreAndSortProducts(products, filters, part).slice(0, 4)

  return {
    label: buildGroupLabel(part, filters),
    part,
    filters,
    debug: {
      aiFilters: parsed.aiFilters,
      fallbackLevel,
      totalCandidates: products.length,
      returnedColors: rankedProducts.map((p) => p.color)
    },
    products: rankedProducts.map((product) => ({
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
  }
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
    const parts = splitIntoSearchParts(userQuery)
    const searches = parts.length ? parts : [userQuery]

    const groups = await Promise.all(
      searches.map(async (part) => {
        const result = await searchOnePart(part)

        return {
          category: result.label,
          sourceQuery: result.part,
          filters: result.filters,
          debug: result.debug,
          products: result.products
        }
      })
    )

    return res.status(200).json({
      query: userQuery,
      groups
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      error: 'Something went wrong',
      details: err?.message ?? 'Unknown error'
    })
  }
}
