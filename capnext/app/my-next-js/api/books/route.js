import {NextResponse} from 'next/server'

const CAP_SERVICE_URL = process.env.CAP_SERVICE_URL || 'http://localhost:4004'

export async function GET() {
  const res = await fetch(`${CAP_SERVICE_URL}/catalog/Books`)
  
  if(!res.ok)
  {    return NextResponse.json({error: 'Failed to fetch books from CAP service'}, {status: 500})
  }

  const books = await res.json()
  return NextResponse.json(books)
}

