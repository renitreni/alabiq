// ---------------------------------------------------------------------
// Admin portal — Integrations tab (Partner API credentials & webhooks)
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import {
  Key,
  Plus,
  Trash2,
  RotateCcw,
  Globe,
  Zap,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  Settings,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { Card, Badge, Field, Spinner, btnPrimary, btnGhost, inputClass } from '../components/ui';
import { DataTable, createColumn } from '../components/DataTable';

export default function IntegrationsView() {
  const [credentials, setCredentials] = useState([]);
  const [webhookEndpoints, setWebhookEndpoints] = useState([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewCredModal, setShowNewCredModal] = useState(false);
  const [newCredName, setNewCredName] = useState('');
  const [newCredExpiry, setNewCredExpiry] = useState('');
  const [createdCredSecret, setCreatedCredSecret] = useState(null);
  const [createdCredId, setCreatedCredId] = useState(null);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await api.adminPartnerCredentials();
      setCredentials(res.credentials || []);
    } catch (err) {
      console.error('fetchCredentials error:', err);
      notifyError('Failed to load credentials');
    }
  }, []);

  const fetchWebhookEndpoints = useCallback(async () => {
    try {
      const res = await api.adminPartnerWebhookEndpoints();
      setWebhookEndpoints(res.endpoints || []);
    } catch (err) {
      console.error('fetchWebhookEndpoints error:', err);
      notifyError('Failed to load webhook endpoints');
    }
  }, []);

  const fetchWebhookDeliveries = useCallback(async (endpointId) => {
    try {
      const res = await api.adminPartnerWebhookDeliveries(endpointId);
      setWebhookDeliveries(res.deliveries || []);
    } catch (err) {
      console.error('fetchWebhookDeliveries error:', err);
      notifyError('Failed to load webhook deliveries');
    }
  }, []);

  useEffect(() => {
    async function load() {
      await Promise.all([fetchCredentials(), fetchWebhookEndpoints()]);
      setLoading(false);
    }
    load();
  }, [fetchCredentials, fetchWebhookEndpoints]);

  const handleCreateCredential = async () => {
    if (!newCredName.trim()) {
      notifyError('Credential name is required');
      return;
    }
    try {
      const res = await api.adminPartnerCreateCredential({
        name: newCredName.trim(),
        expires_at: newCredExpiry || undefined,
      });
      setCreatedCredSecret(res.secret);
      setCreatedCredId(res.credential.id);
      setShowNewCredModal(false);
      setNewCredName('');
      setNewCredExpiry('');
      await fetchCredentials();
      notifySuccess('Credential created — secret shown once below');
    } catch (err) {
      console.error('createCredential error:', err);
      notifyError(err.response?.data?.error?.message || 'Failed to create credential');
    }
  };

  const handleRevokeCredential = async (cred) => {
    if (!(await confirmAction({
      title: 'Revoke Credential',
      text: `Revoke "${cred.name}"? This cannot be undone and will immediately invalidate the API key.`,
      confirmText: 'Revoke',
      variant: 'destructive',
    }))) return;

    try {
      await api.adminPartnerRevokeCredential(cred.id);
      await fetchCredentials();
      notifySuccess('Credential revoked');
    } catch (err) {
      console.error('revokeCredential error:', err);
      notifyError('Failed to revoke credential');
    }
  };

  const handleRotateCredential = async (cred) => {
    if (!(await confirmAction({
      title: 'Rotate Credential',
      text: `Rotate "${cred.name}"? This will revoke the current secret and generate a new one.`,
      confirmText: 'Rotate',
      variant: 'destructive',
    }))) return;

    try {
      const res = await api.adminPartnerRotateCredential(cred.id);
      setCreatedCredSecret(res.secret);
      setCreatedCredId(res.credential.id);
      await fetchCredentials();
      notifySuccess('Credential rotated — new secret shown below');
    } catch (err) {
      console.error('rotateCredential error:', err);
      notifyError('Failed to rotate credential');
    }
  };

  const handleCreateWebhookEndpoint = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const url = form.url.value.trim();
    const events = form.events.value.trim().split(',').map(s => s.trim()).filter(Boolean);
    const isActive = form.is_active.checked;

    if (!url) {
      notifyError('Webhook URL is required');
      return;
    }

    try {
      await api.adminPartnerCreateWebhookEndpoint({ url, events, is_active: isActive });
      form.reset();
      await fetchWebhookEndpoints();
      notifySuccess('Webhook endpoint created');
    } catch (err) {
      console.error('createWebhookEndpoint error:', err);
      notifyError(err.response?.data?.error?.message || 'Failed to create webhook endpoint');
    }
  };

  const handleUpdateWebhookEndpoint = async (endpoint, updates) => {
    try {
      await api.adminPartnerUpdateWebhookEndpoint(endpoint.id, updates);
      await fetchWebhookEndpoints();
      notifySuccess('Webhook endpoint updated');
    } catch (err) {
      console.error('updateWebhookEndpoint error:', err);
      notifyError('Failed to update webhook endpoint');
    }
  };

  const handleDeleteWebhookEndpoint = async (endpoint) => {
    if (!(await confirmAction({
      title: 'Delete Webhook Endpoint',
      text: `Delete "${endpoint.url}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    }))) return;

    try {
      await api.adminPartnerDeleteWebhookEndpoint(endpoint.id);
      await fetchWebhookEndpoints();
      notifySuccess('Webhook endpoint deleted');
    } catch (err) {
      console.error('deleteWebhookEndpoint error:', err);
      notifyError('Failed to delete webhook endpoint');
    }
  };

  const handleReplayDelivery = async (delivery) => {
    try {
      await api.adminPartnerReplayWebhookDelivery(selectedEndpointId, delivery.id);
      notifySuccess('Webhook replay queued');
    } catch (err) {
      console.error('replayWebhookDelivery error:', err);
      notifyError('Failed to replay webhook');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  if (loading) return <Spinner size="lg" />;

  return (
    <div className="space-y-6">
      {/* Credentials Section */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-brand-warm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange/12 flex items-center justify-center">
              <Key className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg font-black text-brand-black">API Credentials</h2>
              <p className="text-xs text-brand-grey">Partner API keys for restaurant delivery integration</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNewCredModal(true)}
            className={btnPrimary + ' !text-sm !px-4 !py-2'}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Credential
          </button>
        </div>

        <div className="overflow-x-auto">
          <DataTable
            data={credentials}
            columns={[
              createColumn({
                key: 'name',
                header: 'Name',
                cell: (c) => (
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <div className="text-xs text-brand-grey">Prefix: <code>{c.key_prefix}</code></div>
                  </div>
                ),
              }),
              createColumn({
                key: 'created_at',
                header: 'Created',
                cell: (c) => new Date(c.created_at).toLocaleDateString(),
              }),
              createColumn({
                key: 'last_used_at',
                header: 'Last Used',
                cell: (c) => c.last_used_at ? new Date(c.last_used_at).toLocaleString() : 'Never',
              }),
              createColumn({
                key: 'expires_at',
                header: 'Expires',
                cell: (c) => c.expires_at ? new Date(c.expires_at).toLocaleDateString() : 'Never',
              }),
              createColumn({
                key: 'status',
                header: 'Status',
                cell: (c) => c.revoked_at ? <Badge className="bg-red-100 text-red-800">Revoked</Badge> : <Badge className="bg-green-100 text-green-800">Active</Badge>,
              }),
              createColumn({
                key: 'actions',
                header: 'Actions',
                cell: (c) => (
                  <div className="flex items-center gap-2">
                    {!c.revoked_at && (
                      <button
                        type="button"
                        onClick={() => handleRotateCredential(c)}
                        className={btnGhost + ' !text-xs !px-2 !py-1'}
                        title="Rotate secret"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!c.revoked_at && (
                      <button
                        type="button"
                        onClick={() => handleRevokeCredential(c)}
                        className={btnGhost + ' !text-xs !px-2 !py-1 text-red-600 hover:bg-red-50'}
                        title="Revoke"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ),
              }),
            ]}
            emptyMessage="No credentials yet. Click 'Add Credential' to create one."
            pagination={false}
          />
        </div>
      </Card>

      {/* Webhook Endpoints Section */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-brand-warm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange/12 flex items-center justify-center">
              <Globe className="w-5 h-5 text-brand-orange" />
            </div>
            <div>
              <h2 className="text-lg font-black text-brand-black">Webhook Endpoints</h2>
              <p className="text-xs text-brand-grey">Configure delivery event webhooks for partner integrations</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b">
          <form onSubmit={handleCreateWebhookEndpoint} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Webhook URL" required>
                <input
                  name="url"
                  type="url"
                  placeholder="https://your-restaurant.com/alabiq/webhook"
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Events (comma-separated)">
                <input
                  name="events"
                  type="text"
                  placeholder="delivery.searching, delivery.rider_assigned, delivery.delivered"
                  className={inputClass}
                />
                <p className="text-xs text-brand-grey mt-1">Leave empty for all delivery events</p>
              </Field>
              <Field label="" className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input name="is_active" type="checkbox" defaultChecked className="w-4 h-4 rounded border-brand-grey text-brand-orange focus:ring-brand-orange" />
                  <span className="text-sm font-medium">Active</span>
                </label>
              </Field>
            </div>
            <button type="submit" className={btnPrimary + ' !text-sm !px-4 !py-2'}>
              <Plus className="w-4 h-4 mr-2" /> Add Endpoint
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <DataTable
            data={webhookEndpoints}
            columns={[
              createColumn({
                key: 'url',
                header: 'URL',
                cell: (w) => <code className="text-xs truncate max-w-xs block">{w.url}</code>,
              }),
              createColumn({
                key: 'events',
                header: 'Events',
                cell: (w) => (
                  <div className="flex flex-wrap gap-1">
                    {(w.events || []).slice(0, 3).map(e => (
                      <Badge key={e} className="bg-brand-warm text-brand-orange text-[10px]">{e}</Badge>
                    ))}
                    {(w.events || []).length > 3 && <Badge className="bg-gray-100 text-gray-600 text-[10px]">+{(w.events || []).length - 3} more</Badge>}
                  </div>
                ),
              }),
              createColumn({
                key: 'is_active',
                header: 'Status',
                cell: (w) => w.is_active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge className="bg-gray-100 text-gray-600">Inactive</Badge>,
              }),
              createColumn({
                key: 'created_at',
                header: 'Created',
                cell: (w) => new Date(w.created_at).toLocaleDateString(),
              }),
              createColumn({
                key: 'actions',
                header: 'Actions',
                cell: (w) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEndpointId(w.id);
                        fetchWebhookDeliveries(w.id);
                      }}
                      className={btnGhost + ' !text-xs !px-2 !py-1'}
                      title="View deliveries"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateWebhookEndpoint(w, { is_active: !w.is_active })}
                      className={btnGhost + ' !text-xs !px-2 !py-1'}
                      title={w.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {w.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWebhookEndpoint(w)}
                      className={btnGhost + ' !text-xs !px-2 !py-1 text-red-600 hover:bg-red-50'}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              }),
            ]}
            emptyMessage="No webhook endpoints configured."
            pagination={false}
          />
        </div>
      </Card>

      {/* Webhook Deliveries (when endpoint selected) */}
      {selectedEndpointId && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-brand-warm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/12 flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-orange" />
              </div>
              <div>
                <h2 className="text-lg font-black text-brand-black">Webhook Deliveries</h2>
                <p className="text-xs text-brand-grey">Recent delivery attempts for the selected endpoint</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  fetchWebhookDeliveries(selectedEndpointId);
                }}
                className={btnGhost + ' !text-sm !px-3 !py-1.5'}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setSelectedEndpointId(null)}
                className={btnGhost + ' !text-sm !px-3 !py-1.5'}
              >
                <XCircle className="w-4 h-4 mr-1.5" /> Close
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <DataTable
              data={webhookDeliveries}
              columns={[
                createColumn({
                  key: 'event_type',
                  header: 'Event',
                  cell: (d) => <code className="text-xs">{d.event_type}</code>,
                }),
                createColumn({
                  key: 'delivery_id',
                  header: 'Delivery',
                  cell: (d) => <code className="text-xs truncate max-w-[120px] block">{d.delivery_id}</code>,
                }),
                createColumn({
                  key: 'sequence',
                  header: 'Seq',
                  cell: (d) => <span className="text-xs font-mono">{d.sequence}</span>,
                }),
                createColumn({
                  key: 'attempt',
                  header: 'Attempt',
                  cell: (d) => <span className="text-xs">{d.attempt}</span>,
                }),
                createColumn({
                  key: 'status',
                  header: 'Status',
                  cell: (d) => getStatusBadge(d.completed_at ? 'completed' : d.last_status ? 'pending' : 'pending'),
                }),
                createColumn({
                  key: 'last_status',
                  header: 'HTTP',
                  cell: (d) => d.last_status ? <span className="text-xs font-mono">{d.last_status}</span> : '—',
                }),
                createColumn({
                  key: 'next_attempt_at',
                  header: 'Next Retry',
                  cell: (d) => d.next_attempt_at && !d.completed_at ? new Date(d.next_attempt_at).toLocaleString() : (d.completed_at ? 'Completed' : '—'),
                }),
                createColumn({
                  key: 'created_at',
                  header: 'Created',
                  cell: (d) => new Date(d.created_at).toLocaleString(),
                }),
                createColumn({
                  key: 'actions',
                  header: 'Actions',
                  cell: (d) => (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedDeliveryId(d.id === expandedDeliveryId ? null : d.id)}
                        className={btnGhost + ' !text-xs !px-2 !py-1'}
                        title={expandedDeliveryId === d.id ? 'Collapse' : 'Expand'}
                      >
                        {expandedDeliveryId === d.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {!d.completed_at && (
                        <button
                          type="button"
                          onClick={() => handleReplayDelivery(d)}
                          className={btnGhost + ' !text-xs !px-2 !py-1 text-brand-orange hover:bg-brand-warm'}
                          title="Replay"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ),
                }),
              ]}
              emptyMessage="No webhook deliveries yet."
              pagination={false}
              rowExpander={(d) => expandedDeliveryId === d.id && (
                <div className="p-4 bg-gray-50 border-t">
                  <h4 className="font-semibold text-sm mb-2">Payload</h4>
                  <pre className="text-xs bg-white p-3 rounded overflow-auto max-h-64 font-mono text-gray-800">{JSON.stringify(d.payload, null, 2)}</pre>
                  {d.last_error && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded">
                      <h5 className="font-semibold text-red-800 text-xs mb-1">Error</h5>
                      <pre className="text-xs font-mono text-red-700">{d.last_error}</pre>
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        </Card>
      )}

      {/* New Credential Modal */}
      {createdCredSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-brand-black">Credential Created</h3>
            </div>
            <div className="mb-4 p-3 bg-brand-warm rounded-xl">
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm font-mono text-brand-orange break-all flex-1">{createdCredSecret}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdCredSecret);
                    notifySuccess('Copied to clipboard');
                  }}
                  className={btnGhost + ' !text-xs !px-2 !py-1 shrink-0'}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-brand-grey mt-2">This secret will not be shown again. Store it securely.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatedCredSecret(null);
                setCreatedCredId(null);
              }}
              className={btnPrimary + ' w-full'}
            >
              I've saved the secret
            </button>
          </div>
        </div>
      )}

      {showNewCredModal && !createdCredSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-brand-black">Create API Credential</h3>
              <button
                type="button"
                onClick={() => setShowNewCredModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-brand-grey"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <Field label="Credential Name" required>
                <input
                  type="text"
                  value={newCredName}
                  onChange={(e) => setNewCredName(e.target.value)}
                  placeholder="e.g. Main Branch Delivery API"
                  className={inputClass}
                  maxLength={100}
                />
              </Field>
              <Field label="Expires At (optional)">
                <input
                  type="datetime-local"
                  value={newCredExpiry}
                  onChange={(e) => setNewCredExpiry(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-brand-grey">Leave empty for no expiry</p>
              </Field>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCredModal(false)}
                  className={btnGhost + ' flex-1'}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCredential}
                  className={btnPrimary + ' flex-1'}
                  disabled={!newCredName.trim()}
                >
                  Create Credential
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
