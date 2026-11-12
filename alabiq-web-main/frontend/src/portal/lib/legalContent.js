// ---------------------------------------------------------------------
// Legal copy (Privacy Policy + Terms of Service), kept separate from the
// SweetAlert2 wrapper in ./legal.js so the same text can render both as a
// popup and as a standalone route. The store listings need a privacy URL a
// reviewer can open while logged out, which a modal cannot provide.
//
// Copy is aligned with the laws of the Kingdom of Saudi Arabia (PDPL for
// privacy; KSA governing law / Riyadh courts for terms) and intentionally
// avoids dash characters. Have legal counsel review before public launch.
// ---------------------------------------------------------------------
import { COMPANY } from '../../config/company';

export const LAST_UPDATED = '9 August 2026';

// Static contact block reused in the Privacy and Terms documents. All values come
// from the developer-controlled company config (never user input) so it is safe
// to inline into the SweetAlert2 html.
const CONTACT_HTML = `
  <p>You can reach ${COMPANY.name} at:</p>
  <ul class="list-disc pl-5 space-y-1">
    <li>Email: ${COMPANY.email}</li>
    <li>Phone: ${COMPANY.phoneDisplay}</li>
    <li>WhatsApp: ${COMPANY.whatsappDisplay}</li>
    <li>Address: ${COMPANY.address.full}</li>
    <li>Website: ${COMPANY.websiteDisplay}</li>
  </ul>`;

const PRIVACY_HTML = `
  <div class="text-left text-sm leading-relaxed text-brand-grey space-y-3">
    <p class="text-xs text-brand-grey">Last updated: ${LAST_UPDATED}</p>
    <p>This Privacy Policy explains how Alabiq collects, uses, stores, and protects your
    personal data when you use our airport Pick and Drop service in Riyadh, Kingdom of Saudi
    Arabia. We process personal data in accordance with the Personal Data Protection Law of the
    Kingdom of Saudi Arabia (Royal Decree No. M/19) and its Implementing Regulations, as
    supervised by the Saudi Data and Artificial Intelligence Authority (SDAIA).</p>

    <h3 class="font-black text-brand-black pt-2">1. Introduction</h3>
    <p>Alabiq acts as the data controller responsible for the personal data you provide when
    you book a ride, create an account, or contact our support team. By using the service you
    acknowledge that you have read and understood this Policy.</p>

    <h3 class="font-black text-brand-black pt-2">2. Data We Collect</h3>
    <ul class="list-disc pl-5 space-y-1">
      <li>Identity data such as your full name and date of birth.</li>
      <li>Contact data such as your mobile number, WhatsApp number, and email address.</li>
      <li>Location data such as your pickup address, drop off address, and, when you choose to
      share it, the precise GPS coordinates of your device.</li>
      <li>Booking data such as trip direction, selected airport terminal, district, date, and fare.</li>
      <li>Payment confirmation data such as the proof of transfer you upload for STC Pay.</li>
    </ul>

    <h3 class="font-black text-brand-black pt-2">3. Lawful Basis and Consent</h3>
    <p>We process your personal data on the basis of your explicit consent, the performance of the
    booking contract you enter into with us, and our legitimate interests in operating a safe and
    reliable service. You may withdraw consent at any time, although this may prevent us from
    completing your booking.</p>

    <h3 class="font-black text-brand-black pt-2">4. Use of Location Data</h3>
    <p>Location data is used solely to identify your pickup or drop off point, to match you with a
    driver, and to display your trip on the live map. Sharing your precise GPS location is always
    optional. We collect location only while the app is open and in use. We do not collect your
    location in the background or when the app is closed.</p>

    <h3 class="font-black text-brand-black pt-2">5. How We Use Your Data</h3>
    <ul class="list-disc pl-5 space-y-1">
      <li>To create and manage your account.</li>
      <li>To confirm, schedule, and fulfil your airport transfer bookings.</li>
      <li>To verify payments and issue booking references.</li>
      <li>To communicate with you about your trips and provide customer support.</li>
      <li>To comply with our legal obligations under Saudi law.</li>
    </ul>

    <h3 class="font-black text-brand-black pt-2">6. Data Sharing and Disclosure</h3>
    <p>We share your personal data only to the extent necessary to deliver the service, including
    sharing trip details with the assigned driver and payment confirmation data with our payment
    partner. We do not sell your personal data. We may disclose data to competent government
    authorities where required by the laws of the Kingdom of Saudi Arabia.</p>

    <h3 class="font-black text-brand-black pt-2">7. Data Retention</h3>
    <p>We retain personal data only for as long as necessary to fulfil the purposes described in
    this Policy, to comply with legal and regulatory requirements, and to resolve disputes.
    Records of completed transactions, including the amount charged and the tax applied, are kept
    for the period required by Saudi tax and accounting law even after you delete your account.
    Those retained records are stripped of the details that identify you.</p>

    <h3 class="font-black text-brand-black pt-2">8. Your Rights under the PDPL</h3>
    <ul class="list-disc pl-5 space-y-1">
      <li>Be informed about how your personal data is processed.</li>
      <li>Access your personal data held by us.</li>
      <li>Request correction of inaccurate or incomplete data.</li>
      <li>Request deletion of your personal data where there is no legal reason to retain it.</li>
      <li>Withdraw your consent at any time.</li>
    </ul>

    <h3 class="font-black text-brand-black pt-2">9. Deleting Your Account</h3>
    <p>You can delete your account at any time from the Profile screen in the app, under Delete
    Account. Deletion removes your sign in credentials, your profile, your contact details, your
    saved addresses, and your profile photo. It cannot be undone. Transaction records are retained
    in anonymised form as described in section 7. If you have already uninstalled the app you can
    request deletion by writing to ${COMPANY.email}.</p>

    <h3 class="font-black text-brand-black pt-2">10. Security</h3>
    <p>We apply appropriate technical and organisational measures to protect your personal data
    against unauthorised access, loss, or misuse.</p>

    <h3 class="font-black text-brand-black pt-2">11. Cross Border Transfers</h3>
    <p>Where personal data needs to be transferred outside the Kingdom of Saudi Arabia, we do so
    only in accordance with the Personal Data Protection Law and its Implementing Regulations.</p>

    <h3 class="font-black text-brand-black pt-2">12. Cookies and Device Storage</h3>
    <p>We do not use advertising or analytics cookies, and we do not use cookies to sign you in.
    The website and app keep a small amount of data in your browser storage, such as your sign in
    session and your saved preferences. The full list, and a way to clear your preferences, is on
    our Cookie Preferences page at ${COMPANY.websiteDisplay}/cookie-preferences.</p>

    <h3 class="font-black text-brand-black pt-2">13. Contact and Complaints</h3>
    <p>If you have any questions about this Policy or wish to exercise your rights, please contact
    our support team using the details below. You also have the right to lodge a
    complaint with the competent supervisory authority in the Kingdom of Saudi Arabia.</p>
    ${CONTACT_HTML}  </div>
`;

const TERMS_HTML = `
  <div class="text-left text-sm leading-relaxed text-brand-grey space-y-3">
    <p class="text-xs text-brand-grey">Last updated: ${LAST_UPDATED}</p>
    <p>These Terms of Service govern your use of the Alabiq airport Pick and Drop service in
    Riyadh, Kingdom of Saudi Arabia. By creating an account or booking a ride you agree to be bound
    by these Terms, which are governed by the laws of the Kingdom of Saudi Arabia.</p>

    <h3 class="font-black text-brand-black pt-2">1. Acceptance of Terms</h3>
    <p>By accessing or using the service you confirm that you accept these Terms and agree to comply
    with them. If you do not agree, you must not use the service.</p>

    <h3 class="font-black text-brand-black pt-2">2. Service Description</h3>
    <p>Alabiq provides a booking platform that connects passengers with drivers for fixed
    price airport transfers between selected districts in Riyadh and the airport terminals.</p>

    <h3 class="font-black text-brand-black pt-2">3. Eligibility</h3>
    <p>You must be at least eighteen years of age and capable of entering into a binding contract
    under the laws of the Kingdom of Saudi Arabia to use the service.</p>

    <h3 class="font-black text-brand-black pt-2">4. Bookings and Fares</h3>
    <p>Fares are displayed before you confirm a booking as a fixed price that includes the base fare
    and the applicable service fee. The fare shown at the time of booking is the amount payable for
    that trip.</p>

    <h3 class="font-black text-brand-black pt-2">5. Payment</h3>
    <p>Payment is made through STC Pay. After you transfer the displayed amount, you must upload a
    clear proof of payment so that your booking can be confirmed.</p>

    <h3 class="font-black text-brand-black pt-2">6. Cancellations and Refunds</h3>
    <p>Cancellation and refund requests are handled in accordance with our published cancellation
    guidelines and the applicable consumer protection rules of the Kingdom of Saudi Arabia.</p>

    <h3 class="font-black text-brand-black pt-2">7. User Responsibilities</h3>
    <ul class="list-disc pl-5 space-y-1">
      <li>Provide accurate pickup and drop off information.</li>
      <li>Be available at the agreed time and location for your trip.</li>
      <li>Treat drivers and staff with respect.</li>
      <li>Use the service only for lawful purposes.</li>
    </ul>

    <h3 class="font-black text-brand-black pt-2">8. Account Closure</h3>
    <p>You may delete your account at any time from the Profile screen in the app. We may suspend or
    close an account that breaches these Terms or is used unlawfully.</p>

    <h3 class="font-black text-brand-black pt-2">9. Limitation of Liability</h3>
    <p>To the maximum extent permitted by the laws of the Kingdom of Saudi Arabia, Alabiq is
    not liable for indirect or consequential losses arising from your use of the service.</p>

    <h3 class="font-black text-brand-black pt-2">10. Governing Law and Jurisdiction</h3>
    <p>These Terms and any dispute arising out of or in connection with them are governed by the
    laws of the Kingdom of Saudi Arabia. The competent courts of the city of Riyadh shall have
    jurisdiction to settle any such dispute.</p>

    <h3 class="font-black text-brand-black pt-2">11. Contact</h3>
    <p>If you have any questions about these Terms, please contact our support team using the
    details below.</p>
    ${CONTACT_HTML}  </div>
`;

// kind -> document. Consumed by the modal (./legal.js) and the standalone
// /privacy-policy and /terms-of-service routes.
export const LEGAL_DOCS = {
  privacy: { title: 'Privacy Policy', html: PRIVACY_HTML },
  terms: { title: 'Terms of Service', html: TERMS_HTML },
};
