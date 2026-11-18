// ---------------------------------------------------------------------
// Driver verification (KYC) screen — shown to a signed-in driver who is not
// yet approved. Lets them upload each required document, see its review
// status, and re-upload anything an admin rejected. Reuses the same signed-
// URL upload flow as payment proofs (files go straight to a PRIVATE bucket).
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, Clock, XCircle, RefreshCw, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { uploadProofFile } from '../lib/gatewayClient';
import { Card, Badge, Spinner, btnPrimary } from '../components/ui';
import { UPLOAD_ACCEPT, UPLOAD_FORMATS_HINT, validateUploadFile } from '../lib/uploadFiles';

const DOC_LABELS = {
  national_id: 'National ID / Iqama',
  license: 'Driving License',
  vehicle_registration: 'Vehicle Registration (Istimara)',
  insurance: 'Vehicle Insurance',
  tga_permit: 'TGA Ride-hailing Permit',
  profile_photo: 'Your Photo',
  vehicle_photo: 'Vehicle Photo + Plate',
};

function statusBadge(status) {
  if (status === 'verified') return <Badge tone="green">Verified</Badge>;
  if (status === 'rejected') return <Badge tone="red">Rejected</Badge>;
  if (status === 'pending') return <Badge tone="amber">Under review</Badge>;
  return <Badge tone="grey">Not uploaded</Badge>;
}

export default function DriverVerification() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadingType, setUploadingType] = useState(null);
  const inputs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.driverDocuments());
    } catch (e) {
      setError(e.message || 'Could not load your documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleFile(docType, file) {
    if (!file) return;
    const check = validateUploadFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setUploadingType(docType);
    setError(null);
    try {
      const { bucket, path, token, maxBytes } = await api.driverDocSignedUrl({
        doc_type: docType,
        file_name: file.name,
        mime_type: check.mimeType,
      });
      if (maxBytes && file.size > maxBytes) {
        throw new Error(`File too large (max ${Math.floor(maxBytes / 1024 / 1024)} MB).`);
      }
      await uploadProofFile(bucket, path, token, file);
      await api.driverRecordDoc({
        path,
        doc_type: docType,
        file_name: file.name,
        mime_type: check.mimeType,
        size_bytes: file.size,
      });
      await load();
    } catch (e) {
      setError(e.message || 'Upload failed. Please try again.');
    } finally {
      setUploadingType(null);
    }
  }

  if (loading && !data) {
    return (
      <Card className="p-8 flex justify-center"><Spinner className="!w-7 !h-7" /></Card>
    );
  }

  const required = (data && data.requiredTypes) || [];
  const byType = {};
  ((data && data.documents) || []).forEach((d) => {
    if (!byType[d.doc_type]) byType[d.doc_type] = d; // documents are newest-first
  });
  const status = (data && data.verificationStatus) || 'none';

  const banner =
    status === 'submitted'
      ? { tone: 'bg-amber-50 border-amber-200 text-amber-800', text: 'Your documents are under review. We will notify you once an admin approves your account.' }
      : status === 'rejected'
      ? { tone: 'bg-red-50 border-red-200 text-red-700', text: 'One or more documents were rejected. Please re-upload the ones marked Rejected below.' }
      : { tone: 'bg-brand-muted border-brand-border text-brand-grey', text: 'Upload the documents below to get verified. You can only accept rides after an admin approves you.' };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-brand-orange" />
          <p className="font-black text-brand-black">Driver verification</p>
        </div>
        <p className={`text-sm rounded-xl border p-3 mt-2 ${banner.tone}`}>{banner.text}</p>
        <p className="text-xs text-brand-grey mt-2">{UPLOAD_FORMATS_HINT}</p>
      </Card>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <Card className="divide-y divide-brand-border">
        {required.map((type) => {
          const doc = byType[type];
          const st = doc ? doc.status : 'missing';
          const busy = uploadingType === type;
          const canUpload = st !== 'verified'; // no need to re-upload a verified doc
          return (
            <div key={type} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {st === 'verified' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  {st === 'pending' && <Clock className="w-4 h-4 text-amber-500" />}
                  {st === 'rejected' && <XCircle className="w-4 h-4 text-red-600" />}
                  <span className="font-bold text-brand-dark">{DOC_LABELS[type] || type}</span>
                </div>
                {doc && doc.file_name && (
                  <div className="text-xs text-brand-grey truncate mt-0.5">{doc.file_name}</div>
                )}
                {st === 'rejected' && doc && doc.rejection_reason && (
                  <div className="text-xs text-red-600 mt-0.5">Reason: {doc.rejection_reason}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(st)}
                {canUpload && (
                  <>
                    <input
                      ref={(el) => { inputs.current[type] = el; }}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(type, f); }}
                    />
                    <button
                      type="button"
                      onClick={() => inputs.current[type]?.click()}
                      disabled={busy}
                      className={btnPrimary + ' !py-2 !px-3 text-sm'}
                    >
                      {busy ? (
                        <Spinner className="!border-white/40 !border-t-white" />
                      ) : (
                        <>
                          <UploadCloud className="w-4 h-4" /> {doc ? 'Replace' : 'Upload'}
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <div className="flex justify-center">
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-grey hover:text-brand-dark cursor-pointer">
          <RefreshCw className="w-4 h-4" /> Refresh status
        </button>
      </div>
    </div>
  );
}
