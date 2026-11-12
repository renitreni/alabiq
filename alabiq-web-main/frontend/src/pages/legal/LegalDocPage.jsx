import { LEGAL_DOCS } from '../../portal/lib/legalContent';
import LegalLayout from './LegalLayout';

// kind: 'privacy' | 'terms'. The html is developer-authored copy from
// legalContent.js with no user input anywhere in it, which is what makes
// dangerouslySetInnerHTML safe here; it is the same string the modal renders.
export default function LegalDocPage({ kind }) {
  const doc = LEGAL_DOCS[kind];
  if (!doc) return null;

  return (
    <LegalLayout title={doc.title}>
      <div dangerouslySetInnerHTML={{ __html: doc.html }} />
    </LegalLayout>
  );
}
