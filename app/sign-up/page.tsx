import { redirect } from 'next/navigation';

/** Joining is one page now; this address is kept so old links still work. */
export default function SignUpPage() {
  redirect('/register');
}
