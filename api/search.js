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

    // 1. AI → strukturera intent
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `
Extract shopping intent from query.
Return JSON with keys:
category, color, style
          `
        },
        {
          role: 'user',
          content: query
        }
      ]
    })

    const filters = JSON.parse(aiResponse.choices[0].message.content)

    // 2. Hämta produkter (enkelt MVP-filter)
    let dbQuery = supabase.from('products').select('*').limit(20)

    if (filters.category) {
      dbQuery = dbQuery.eq('category', filters.category)
    }

    if (filters.color) {
      dbQuery = dbQuery.ilike('color', `%${filters.color}%`)
    }

    const { data: products, error } = await dbQuery

    if (error) throw error

    // 3. Returnera i "groups"-format
    return res.status(200).json({
      groups: [
        {
          title: 'Top picks',
          products: products || []
        }
      ]
    })

  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Something went wrong' })
  }
}