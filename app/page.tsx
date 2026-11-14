import { redirect } from 'next/navigation'

// Root page: redirect to login (middleware will forward authenticated users
// to their role dashboard before this even renders)
export default function RootPage() {
  redirect('/login')
}
