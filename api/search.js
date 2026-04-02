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
Extract shopping intent from the user's clothing search.

Return valid JSON with these keys:
- category
- color
- style

Rules:
- Use English values
- category should be a simple product type like: jacket, pants, jeans, sweater, shoes, hat
- color should be a simple color like: black, blue, red, green, beige, pink
- if unknown, use null
          `
        },
        {
          role: 'user',
          content: query
        }
      ]
    })

    const filters = JSON.parse(aiResponse.choices[0].message.content)

    let dbQuery = supabase
      .from('products')
      .select('*')
      .limit(20)

    // Mjukare filter än eq()
    if (filters.category) {
      dbQuery = dbQuery.ilike('category', `%${filters.category}%`)
    }

    if (filters.color) {
      dbQuery = dbQuery.ilike('color', `%${filters.color}%`)
    }

    let { data: products, error } = await dbQuery

    if (error) throw error

    // Fallback: om filtren gav 0 träffar, returnera ändå något från DB
    if (!products || products.length === 0) {
      const fallbackQuery = await supabase
        .from('products')
        .select('*')
        .limit(20)

      if (fallbackQuery.error) throw fallbackQuery.error
      products = fallbackQuery.data || []
    }

    const mappedProducts = (products || []).map((product) => ({
      id: String(product.id),
      name: product.name,
      price: product.price_sek ?? 0,
      store: product.retailer ?? product.brand ?? 'Store',
      imageQuery: product.name ?? '',
      color: product.color ?? ''
    }))

    return res.status(200).json({
      groups: [
        {
          category: 'Top picks',
          products: mappedProducts
        }
      ]
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Something went wrong' })
  }
}
