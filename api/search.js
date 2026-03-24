console.log("OPENAI KEY PRESENT:", !!process.env.OPENAI_API_KEY)
console.log("OPENAI KEY PREFIX:", process.env.OPENAI_API_KEY?.slice(0, 7))

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { query } = req.body || {}

    if (!query) {
      return res.status(400).json({ error: 'Missing query' })
    }

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `
You convert children's clothing shopping requests into structured JSON filters.

Return ONLY valid JSON in this exact shape:
{
  "category": "jacket" | "pants" | "overall" | "vest" | null,
  "subcategory": string | null,
  "age": number | null,
  "max_price": number | null,
  "eco": true | false | null,
  "style": string | null,
  "color": string | null,
  "pattern": string | null
}

Rules:
- Map Swedish and English clothing words to the schema.
- "jacka" -> "jacket"
- "byxa" or "byxor" -> "pants"
- "overall" -> "overall"
- "väst" -> "vest"
- "skaljacka" usually means category "jacket", subcategory "shell"
- "fleecejacka" usually means category "jacket", subcategory "fleece"
- "vinterjacka", "varm jacka", "vadderad jacka", "skidjacka" usually imply subcategory "winter"
- If user says "billig", infer a reasonable max_price only if an explicit amount is not given. Otherwise set max_price to null.
- If user mentions eco / ekologisk / recycled / hållbar, set eco = true.
- Normalize colors to English lowercase like: pink, navy, blue, purple, green, dark-green, yellow, orange, beige, off-white, black.
- Normalize pattern to one of: solid, striped, dotted, floral, unicorn, dinosaur, or null.
- Normalize style to one of: minimal, sporty, playful, retro, outdoor, comfy, ski, classic, or null.
`
        },
        {
          role: 'user',
          content: query
        }
      ]
    })

    const raw = aiResponse.choices?.[0]?.message?.content || '{}'
    const filters = JSON.parse(raw)

    let dbQuery = supabase
      .from('products')
      .select('*')
      .eq('in_stock', true)

    if (filters.category) dbQuery = dbQuery.eq('category', filters.category)
    if (filters.subcategory) dbQuery = dbQuery.eq('subcategory', filters.subcategory)

    if (filters.age !== null && filters.age !== undefined) {
      dbQuery = dbQuery.lte('age_min', filters.age).gte('age_max', filters.age)
    }

    if (filters.max_price !== null && filters.max_price !== undefined) {
      dbQuery = dbQuery.lte('price_sek', filters.max_price)
    }

    if (filters.eco !== null && filters.eco !== undefined) {
      dbQuery = dbQuery.eq('eco', filters.eco)
    }

    if (filters.style) dbQuery = dbQuery.eq('style', filters.style)
    if (filters.color) dbQuery = dbQuery.eq('color', filters.color)
    if (filters.pattern) dbQuery = dbQuery.eq('pattern', filters.pattern)

    const { data, error } = await dbQuery.limit(6)

    if (error) {
      return res.status(500).json({ error: error.message, filters })
    }

    return res.status(200).json({ filters, products: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown error' })
  }
}
