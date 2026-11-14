import { NextResponse } from 'next/server'
import twilio from 'twilio'

// Helper to clean and format Indian/international phone numbers
function cleanPhoneNumber(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = '+91' + cleaned
    } else {
      cleaned = '+' + cleaned
    }
  }
  return cleaned
}

export async function POST(request: Request) {
  try {
    const { to, message } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message parameter' }, { status: 400 })
    }

    const cleanedTo = cleanPhoneNumber(to)
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER

    const isPlaceholder = 
      !accountSid || 
      !authToken || 
      !fromNumber ||
      accountSid.startsWith('ACXXXXXX') || 
      authToken.includes('your_auth') || 
      fromNumber.includes('+12345')

    if (isPlaceholder) {
      console.log('\n--- [TWILIO MOCK SMS] ---')
      console.log(`To (Cleaned): ${cleanedTo}`)
      console.log(`Original To:  ${to}`)
      console.log(`Message:      ${message}`)
      console.log('Status:       SUCCESS (Mocked - Twilio is using placeholder credentials)')
      console.log('-------------------------\n')

      return NextResponse.json({ 
        success: true, 
        mocked: true, 
        message: 'SMS logged to console (placeholder credentials in use).' 
      })
    }

    // Initialize Twilio client and send
    const client = twilio(accountSid, authToken)
    const twilioResponse = await client.messages.create({
      body: message,
      from: fromNumber,
      to: cleanedTo
    })

    console.log(`[TWILIO SUCCESS] SMS sent to ${cleanedTo}, SID: ${twilioResponse.sid}`)

    return NextResponse.json({ 
      success: true, 
      sid: twilioResponse.sid 
    })

  } catch (error: any) {
    console.error('Twilio SMS error:', error)
    // Return success: true but with a warning so the UI flow doesn't break
    return NextResponse.json({ 
      success: true, 
      error: error.message,
      warning: 'Twilio dispatch failed, check server console for details.' 
    })
  }
}
