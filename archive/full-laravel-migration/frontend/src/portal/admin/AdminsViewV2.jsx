// ---------------------------------------------------------------------
// Admin — Admin Accounts & Login Activity using DataTable component
// ---------------------------------------------------------------------
import { useCallback, useMemo, useState } from 'react';
import {
  ShieldCheck,
  ShieldX,
  Plus,
  KeyRound,
  RefreshCw,
  Search,
  Download,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { MAX_NAME_LENGTH } from '../lib/fieldValidation';
import { notifySuccess, notifyError } from '../lib/notify';
import { toCsv, downloadCsv } from '../lib/csv';
import { DataTable, createColumn } from '../components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/portal/components/ui';
import { PasswordInput } from '../components/PasswordInput';

const EMPTY_ADMIN = {
  email: '',
  full_name: '',
  mobile_number: '',
  whatsapp_number: '',
  is_super_admin: false,
};

function fmtWhen(ts) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function PasswordPanel({ email, password, onDone }) {
  return (
    <Card className="p-4 border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 text-amber-600 mt-0.5 shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900">Password for {email}</p>
          <p className="text-sm text-amber-800 mt-1">
            This is shown once and is not stored anywhere. Copy it now and give it to them
            privately, then have them change it on first login.
          </p>
          <code className="block mt-2 px-3 py-2 rounded-xl bg-white border border-amber-300 font-mono text-sm break-all">
            {password}
          </code>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => {
                navigator.clipboard?.writeText(password).then(
                  () => notifySuccess('Password copied'),
                  () => notifyError('Could not copy. Select the text and copy it by hand.')
                );
              }}
            >
              Copy
            </button>
            <button type="button" className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-medium hover:bg-brand-orange/90" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
