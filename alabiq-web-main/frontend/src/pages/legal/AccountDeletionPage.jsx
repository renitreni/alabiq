import { Link } from 'react-router-dom';
import { COMPANY } from '../../config/company';
import LegalLayout from './LegalLayout';

// Google Play requires a publicly reachable deletion page for users who have
// already uninstalled and so cannot reach the in-app flow. It has to name the app,
// say exactly what goes and what stays, and give a route that does not need a login.
const DELETED = [
  'Your sign in credentials, so the account can no longer be used.',
  'Your profile: full name, email address, mobile number, and WhatsApp number.',
  'Your saved pickup and drop off addresses, and any GPS coordinates stored with them.',
  'Your profile photo.',
  'The contact details and delivery addresses attached to your past bookings and orders.',
];

const RETAINED = [
  'The record that a transaction happened, its amount, and the tax applied. Saudi tax and accounting law requires us to keep these.',
  'Payment confirmations already reviewed by our finance team, for dispute resolution.',
];

export default function AccountDeletionPage() {
  return (
    <LegalLayout title="Delete your account">
      <div className="space-y-6 text-sm leading-relaxed text-brand-grey">
        <p>
          This page explains how to delete your {COMPANY.name} account and what happens to your
          data. Deletion is permanent and cannot be undone.
        </p>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">Option 1: delete from the app</h2>
          <p>
            Open {COMPANY.name}, go to <strong>Profile</strong>, scroll to the bottom and choose{' '}
            <strong>Delete Account</strong>. You will be asked to confirm. Your account is removed
            immediately and you are signed out.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">Option 2: request deletion by email</h2>
          <p>
            If you have already uninstalled the app, send a deletion request from the email address
            on your account to{' '}
            <a href={`mailto:${COMPANY.email}`} className="underline hover:text-brand-orange">
              {COMPANY.email}
            </a>
            . We verify the request and complete the deletion within 30 days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">What is deleted</h2>
          <ul className="list-disc space-y-1 pl-5">
            {DELETED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">What is kept, and why</h2>
          <ul className="list-disc space-y-1 pl-5">
            {RETAINED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            These retained records are stripped of the details that identify you. They cannot be
            traced back to you or used to contact you.
          </p>
        </section>

        <p>
          See our{' '}
          <Link to="/privacy-policy" className="underline hover:text-brand-orange">
            Privacy Policy
          </Link>{' '}
          for the full description of how we handle personal data.
        </p>
      </div>
    </LegalLayout>
  );
}
