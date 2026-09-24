import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  FileSpreadsheet,
  Download,
  CheckSquare,
  Square,
  X,
  CheckCircle,
  AlertTriangle,
  Mail,
  Phone,
  Building,
  Tag,
} from 'lucide-react';
import { Contact, ContactStatus } from '../types';
import {
  subscribeToContacts,
  addContact,
  updateContact,
  deleteContact,
  bulkDeleteContacts,
} from '../services/contactService';
import { exportContactsToExcel } from '../utils/excelParser';
import { useToast } from '../contexts/ToastContext';
import { ActivePage } from '../components/layout/AppLayout';

interface ContactsPageProps {
  onNavigate: (page: ActivePage) => void;
}

export const ContactsPage: React.FC<ContactsPageProps> = ({ onNavigate }) => {
  const { success, error: toastError } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    tags: '',
    status: 'subscribed' as ContactStatus,
    consentGiven: true,
  });

  useEffect(() => {
    const unsub = subscribeToContacts(setContacts);
    return () => unsub();
  }, []);

  // Compute available tags for filter
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        (c.company && c.company.toLowerCase().includes(query)) ||
        c.phone.includes(query) ||
        c.tags.some((t) => t.toLowerCase().includes(query));

      const matchesStatus =
        selectedStatus === 'all' || c.status === selectedStatus;

      const matchesTag =
        selectedTag === 'all' || c.tags.includes(selectedTag);

      return matchesSearch && matchesStatus && matchesTag;
    });
  }, [contacts, searchQuery, selectedStatus, selectedTag]);

  // Bulk Selection Handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} selected contact(s)?`)) return;

    try {
      await bulkDeleteContacts(Array.from(selectedIds));
      success('Deleted', `Successfully deleted ${selectedIds.size} contacts.`);
      setSelectedIds(new Set());
    } catch (err: any) {
      toastError('Bulk Delete Failed', err?.message);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company || '',
      tags: contact.tags.join(', '),
      status: contact.status,
      consentGiven: contact.consentGiven ?? true,
    });
    setIsAddModalOpen(true);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingContact(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      company: '',
      tags: '',
      status: 'subscribed',
      consentGiven: true,
    });
    setIsAddModalOpen(true);
  };

  // Save Contact (Create or Edit)
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toastError('Validation Error', 'Name and valid email are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tagsArray = formData.tags
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (editingContact) {
        await updateContact(editingContact.id, {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          company: formData.company.trim(),
          tags: tagsArray,
          status: formData.status,
          consentGiven: formData.consentGiven,
        });
        success('Contact Updated', `Updated details for ${formData.name}`);
      } else {
        await addContact({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone.trim(),
          company: formData.company.trim(),
          tags: tagsArray,
          status: formData.status,
          consentGiven: formData.consentGiven,
          source: 'manual',
        });
        success('Contact Added', `Created contact for ${formData.name}`);
      }
      setIsAddModalOpen(false);
    } catch (err: any) {
      toastError('Save Error', err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Single Contact
  const handleDeleteConfirm = async () => {
    if (!contactToDelete) return;
    try {
      await deleteContact(contactToDelete.id);
      success('Contact Deleted', `Removed ${contactToDelete.name}`);
      setContactToDelete(null);
      if (selectedIds.has(contactToDelete.id)) {
        const next = new Set(selectedIds);
        next.delete(contactToDelete.id);
        setSelectedIds(next);
      }
    } catch (err: any) {
      toastError('Delete Failed', err?.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Contact Directory</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage target recipients, subscriptions, consent states, and audience segmentation.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => exportContactsToExcel(filteredContacts)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export (.xlsx)
          </button>
          <button
            onClick={() => onNavigate('import-contacts')}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded-xl border border-emerald-500/30 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Import Excel
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, company, phone, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full md:w-36 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="subscribed">Subscribed</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>

          {/* Tag filter */}
          <select
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
            className="w-full md:w-36 px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk action header if items selected */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-950/70 border border-indigo-700/60 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-200">
          <span className="font-semibold">
            {selectedIds.size} of {filteredContacts.length} contact(s) selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-2 py-1 text-slate-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="p-4 w-10">
                  <button onClick={handleSelectAll} className="text-slate-400 hover:text-white">
                    {selectedIds.size > 0 && selectedIds.size === filteredContacts.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-4">Contact</th>
                <th className="p-4">Communication</th>
                <th className="p-4">Company</th>
                <th className="p-4">Tags</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-white">No contacts found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {contacts.length === 0
                        ? 'Get started by uploading an Excel (.xlsx / .xls) spreadsheet'
                        : 'No contacts match your active search or filters'}
                    </p>
                    {contacts.length === 0 && (
                      <button
                        onClick={() => onNavigate('import-contacts')}
                        className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Import Excel Contacts Now
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedIds.has(contact.id);
                  return (
                    <tr
                      key={contact.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-indigo-950/25' : ''
                      }`}
                    >
                      <td className="p-4">
                        <button
                          onClick={() => handleToggleSelect(contact.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-white">{contact.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {contact.source ? `Source: ${contact.source}` : 'Manual Entry'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{contact.phone || 'No phone'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{contact.company || '—'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {contact.tags && contact.tags.length > 0 ? (
                            contact.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/70 text-[10px]"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                            contact.status === 'subscribed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : contact.status === 'unsubscribed'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {contact.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(contact)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Edit Contact"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setContactToDelete(contact)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                            title="Delete Contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {filteredContacts.length} of {contacts.length} total contacts
          </span>
          <span>Firestore Real-Time Sync</span>
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              {editingContact ? 'Edit Contact' : 'Add New Contact'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Contact records are stored in Firestore and targetable by monthly campaigns.
            </p>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah Jenkins"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sarah@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Phone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+14155552671"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Company / Organization
                </label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="VIP, Newsletter, West Coast"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Subscription Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as ContactStatus })
                    }
                    className="w-full px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="subscribed">Subscribed</option>
                    <option value="unsubscribed">Unsubscribed</option>
                    <option value="bounced">Bounced</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.consentGiven}
                      onChange={(e) =>
                        setFormData({ ...formData, consentGiven: e.target.checked })
                      }
                      className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Explicit Consent Given</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingContact ? 'Save Changes' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Delete Contact?</h3>
            <p className="text-xs text-slate-400 mb-6">
              Are you sure you want to remove <strong>{contactToDelete.name}</strong> ({contactToDelete.email})? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setContactToDelete(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md shadow-rose-600/20"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
