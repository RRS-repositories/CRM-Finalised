
import React, { useState, useRef } from 'react';
import { 
  Plus, Edit, Trash2, Search, Filter, Share2, 
  MoreVertical, FileText, Type, Hash, Calendar, 
  CheckSquare, List, AlignLeft, PenTool, Save, Eye, X,
  ArrowLeft, BookOpen, CheckCircle, Play, Database, GripVertical
} from 'lucide-react';
import { useCRM } from '../context/CRMContext';
import { Form, FormElement, FormElementType } from '../types';

const Forms: React.FC = () => {
  const { forms, addForm, updateForm, deleteForm } = useCRM();
  const [viewMode, setViewMode] = useState<'list' | 'builder' | 'preview'>('list');
  const [returnToView, setReturnToView] = useState<'list' | 'builder'>('list'); // Track where to return
  const [currentForm, setCurrentForm] = useState<Form | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Builder State
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const filteredForms = forms.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNew = () => {
    const newFormId = addForm({
      name: 'New Untitled Form',
      description: 'Description of your form...',
      elements: []
    }).id;
    
    // Find the newly created form to edit
    const created = forms.find(f => f.id === newFormId) || {
      id: newFormId!,
      name: 'New Untitled Form',
      description: '',
      elements: [],
      createdAt: '',
      responseCount: 0,
      status: 'Draft'
    };
    
    setCurrentForm(created);
    setViewMode('builder');
  };

  const handleEditForm = (form: Form) => {
    setCurrentForm(JSON.parse(JSON.stringify(form))); // Deep copy to avoid direct mutation
    setViewMode('builder');
  };

  const handleSaveForm = () => {
    if (currentForm) {
      updateForm(currentForm);
      setViewMode('list');
    }
  };

  const handlePreview = (form: Form) => {
    setCurrentForm(form);
    setReturnToView('list');
    setViewMode('preview');
  };

  // --- Sub-Components Rendering ---

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 transition-colors">
        <div className="flex justify-between items-center mb-6">
           <div>
              <h1 className="text-2xl font-bold text-navy-900 dark:text-white">Forms</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Build and manage client intake forms and questionnaires.</p>
           </div>
           <button 
             onClick={handleCreateNew}
             className="bg-brand-orange hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
           >
              <Plus size={18} /> Create Form
           </button>
        </div>

        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1">
           {/* Toolbar */}
           <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800">
              <div className="relative w-72">
                 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input 
                   type="text" 
                   placeholder="Search forms..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                 />
              </div>
              <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-700 bg-white dark:bg-slate-800">
                 <Filter size={16} /> Filter
              </button>
           </div>

           {/* List */}
           <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                 <thead className="bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700 sticky top-0">
                    <tr>
                       <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Form Name</th>
                       <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                       <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Responses</th>
                       <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                       <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                    {filteredForms.map(form => (
                       <tr key={form.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-700 transition-colors group">
                          <td className="px-6 py-4">
                             <div className="font-medium text-navy-900 dark:text-white">{form.name}</div>
                             <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{form.description}</div>
                          </td>
                          <td className="px-6 py-4">
                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                form.status === 'Published' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 
                                form.status === 'Draft' ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600' : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
                             }`}>
                                {form.status}
                             </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{form.responseCount}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{form.createdAt}</td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handlePreview(form)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Preview">
                                   <Eye size={16} />
                                </button>
                                <button onClick={() => handleEditForm(form)} className="p-1.5 text-gray-500 hover:text-navy-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-600 rounded" title="Edit">
                                   <Edit size={16} />
                                </button>
                                <button className="p-1.5 text-gray-500 hover:text-brand-orange hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded" title="Share">
                                   <Share2 size={16} />
                                </button>
                                <button onClick={() => deleteForm(form.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Delete">
                                   <Trash2 size={16} />
                                </button>
                             </div>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
              {filteredForms.length === 0 && (
                 <div className="p-12 text-center text-gray-400">
                    <p>No forms found.</p>
                 </div>
              )}
           </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'builder' && currentForm) {
    return (
      <FormBuilder 
        form={currentForm} 
        setForm={setCurrentForm} 
        onSave={handleSaveForm} 
        onCancel={() => setViewMode('list')}
        onPreview={() => {
          setReturnToView('builder');
          setViewMode('preview');
        }}
        selectedElementId={selectedElementId}
        setSelectedElementId={setSelectedElementId}
      />
    );
  }

  if (viewMode === 'preview' && currentForm) {
    return (
       <FormPreview 
         form={currentForm} 
         onClose={() => setViewMode(returnToView)} 
       />
    );
  }

  return null;
};

// --- Form Builder Component ---

interface FormBuilderProps {
  form: Form;
  setForm: (f: Form) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: () => void;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
}

const FormBuilder: React.FC<FormBuilderProps> = ({ form, setForm, onSave, onCancel, onPreview, selectedElementId, setSelectedElementId }) => {
  
  const addElement = (type: FormElementType) => {
    const newElement: FormElement = {
      id: `e${Date.now()}`,
      type,
      label: type === 'terms' ? 'Terms & Conditions' : `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      required: type === 'terms', // Terms usually required
      placeholder: type === 'terms' ? 'I agree to the Terms of Service and Privacy Policy.' : '',
      mappingKey: ''
    };
    setForm({ ...form, elements: [...form.elements, newElement] });
    setSelectedElementId(newElement.id);
  };

  const removeElement = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setForm({ ...form, elements: form.elements.filter(el => el.id !== id) });
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const updateElement = (id: string, updates: Partial<FormElement>) => {
    setForm({
      ...form,
      elements: form.elements.map(el => el.id === id ? { ...el, ...updates } : el)
    });
  };

  const selectedElement = form.elements.find(el => el.id === selectedElementId);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <div className="h-16 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 shadow-sm z-10 flex-shrink-0">
         <div className="flex items-center gap-4">
            <button onClick={onCancel} className="text-gray-500 hover:text-navy-700 dark:hover:text-white">
               <ArrowLeft size={20} />
            </button>
            <div className="h-8 w-px bg-gray-200 dark:bg-slate-700"></div>
            <div>
               <input 
                 type="text" 
                 value={form.name}
                 onChange={(e) => setForm({...form, name: e.target.value})}
                 className="font-bold text-lg text-navy-900 dark:text-white border-b border-transparent hover:border-gray-300 dark:hover:border-slate-600 focus:border-navy-600 focus:ring-0 bg-transparent px-1 py-0.5 w-64 transition-colors"
                 placeholder="Form Name"
               />
               <input 
                 type="text" 
                 value={form.description}
                 onChange={(e) => setForm({...form, description: e.target.value})}
                 className="text-xs text-gray-500 dark:text-gray-400 block border-b border-transparent hover:border-gray-300 dark:hover:border-slate-600 focus:border-navy-600 focus:ring-0 bg-transparent px-1 py-0.5 w-96 mt-0.5"
                 placeholder="Add a description..."
               />
            </div>
         </div>
         <div className="flex gap-3">
             <div className="flex items-center gap-2 mr-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Status:</span>
                <select 
                   value={form.status} 
                   onChange={(e) => setForm({...form, status: e.target.value as any})}
                   className="bg-transparent font-medium text-navy-700 dark:text-white focus:outline-none cursor-pointer"
                >
                   <option value="Draft" className="dark:bg-slate-800">Draft</option>
                   <option value="Published" className="dark:bg-slate-800">Published</option>
                   <option value="Archived" className="dark:bg-slate-800">Archived</option>
                </select>
             </div>
             <button onClick={onPreview} className="text-gray-500 hover:text-navy-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors">
                <Play size={16} /> Preview
             </button>
             <button onClick={onSave} className="bg-navy-700 hover:bg-navy-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 shadow-sm text-sm">
                <Save size={16} /> Save Form
             </button>
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
         {/* Sidebar: Toolbox */}
         <div className="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 overflow-y-auto p-4 flex flex-col gap-6 flex-shrink-0">
            <div>
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Basic Fields</h3>
               <div className="grid grid-cols-2 gap-2">
                  <ToolboxItem icon={Type} label="Text" onClick={() => addElement('text')} />
                  <ToolboxItem icon={AlignLeft} label="Text Area" onClick={() => addElement('textarea')} />
                  <ToolboxItem icon={Hash} label="Number" onClick={() => addElement('number')} />
                  <ToolboxItem icon={Calendar} label="Date" onClick={() => addElement('date')} />
                  <ToolboxItem icon={CheckSquare} label="Checkboxes" onClick={() => addElement('checkbox')} />
                  <ToolboxItem icon={List} label="Dropdown" onClick={() => addElement('select')} />
               </div>
            </div>
            <div>
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Advanced</h3>
               <div className="grid grid-cols-2 gap-2">
                  <ToolboxItem icon={PenTool} label="Signature" onClick={() => addElement('signature')} />
                  <ToolboxItem icon={FileText} label="File Upload" onClick={() => addElement('file')} />
                  <ToolboxItem icon={BookOpen} label="Terms" onClick={() => addElement('terms')} />
               </div>
            </div>
         </div>

         {/* Canvas */}
         <div className="flex-1 bg-slate-100 dark:bg-slate-900 overflow-y-auto p-8 flex justify-center pb-24">
            <div className="w-full max-w-2xl">
               {/* Form Card */}
               <div className="bg-white shadow-sm border border-gray-200 rounded-xl min-h-[500px] flex flex-col transition-colors">
                  {/* Form Header */}
                  <div className="p-8 border-b border-gray-50 text-center">
                    <h2 className="text-2xl font-bold text-navy-900">{form.name}</h2>
                    <p className="text-gray-500 mt-2">{form.description}</p>
                  </div>

                  {/* Form Body */}
                  <div className="p-8 flex-1 space-y-6">
                    {form.elements.length === 0 && (
                      <div className="h-48 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/50">
                          <p>Drag elements here or click from sidebar</p>
                      </div>
                    )}

                    {form.elements.map((el) => (
                      <div 
                        key={el.id} 
                        onClick={() => setSelectedElementId(el.id)}
                        className={`
                          relative p-5 rounded-lg border transition-all cursor-pointer group 
                          ${selectedElementId === el.id 
                            ? 'border-brand-orange ring-1 ring-brand-orange ring-opacity-20 bg-orange-50/5' 
                            : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                          }
                        `}
                      >
                          {/* Hover Handle */}
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100">
                             <GripVertical size={16} />
                          </div>

                          {/* Label Row */}
                          <div className="flex justify-between items-center mb-2 pl-2">
                             <div className="block text-sm font-semibold text-gray-800">
                                {el.label} {el.required && <span className="text-red-500">*</span>}
                             </div>
                             {el.mappingKey && (
                                <span className="flex items-center text-[10px] font-medium bg-blue-50 text-blue-600 px-2 py-1 rounded-full border border-blue-100">
                                   <Database size={10} className="mr-1.5" />
                                   Maps to: {el.mappingKey}
                                </span>
                             )}
                          </div>
                          
                          {/* Preview of Input (Interactive-looking but read-only) */}
                          <div className="pointer-events-none pl-2">
                            {el.type === 'text' && <input type="text" className="w-full border-gray-300 rounded-lg shadow-sm p-2.5 border bg-white text-gray-400" readOnly placeholder={el.placeholder || 'Short answer text'} />}
                            {el.type === 'textarea' && <textarea className="w-full border-gray-300 rounded-lg shadow-sm p-2.5 border bg-white text-gray-400" rows={3} readOnly placeholder={el.placeholder || 'Long answer text'} />}
                            {el.type === 'number' && <input type="number" className="w-full border-gray-300 rounded-lg shadow-sm p-2.5 border bg-white text-gray-400" readOnly placeholder="0" />}
                            {el.type === 'date' && <div className="w-full border-gray-300 rounded-lg shadow-sm p-2.5 border bg-white text-gray-400 flex justify-between items-center"><span>mm/dd/yyyy</span><Calendar size={16}/></div>}
                            
                            {el.type === 'signature' && (
                                <div className="h-32 bg-gray-50 border border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400">
                                  <PenTool size={24} className="mb-2 opacity-20" />
                                  <span className="text-xs">Signature Pad</span>
                                </div>
                            )}
                            
                            {(el.type === 'select') && (
                                <div className="w-full border-gray-300 rounded-lg shadow-sm p-2.5 border bg-white text-gray-400 flex justify-between items-center">
                                  <span>Select an option</span>
                                  <List size={16} />
                                </div>
                            )}
                            
                            {el.type === 'checkbox' && (
                                <div className="flex items-center">
                                   <div className="h-5 w-5 border-gray-300 rounded border bg-white mr-2"></div>
                                   <span className="text-sm text-gray-500">{el.placeholder || 'Option Label'}</span>
                                </div>
                            )}
                            
                            {el.type === 'terms' && (
                                <div className="flex items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
                                  <div className="mt-0.5 h-4 w-4 border-gray-300 rounded border bg-white mr-3"></div>
                                  <p className="text-sm text-gray-500 leading-snug">{el.placeholder || 'I agree to the Terms of Service and Privacy Policy.'}</p>
                                </div>
                            )}
                            
                            {el.type === 'file' && (
                                <div className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                                   <FileText size={24} className="mb-2 opacity-50" />
                                   <span className="text-xs">File Upload Area</span>
                                </div>
                            )}
                          </div>

                          {/* Delete Action */}
                          <button 
                            onClick={(e) => removeElement(el.id, e)}
                            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                            title="Remove Field"
                          >
                            <Trash2 size={16} />
                          </button>
                      </div>
                    ))}
                  </div>

                  {/* Footer with Fake Submit */}
                  <div className="p-8 pt-0 mt-4 opacity-60 grayscale pointer-events-none">
                     <button className="w-full bg-brand-orange text-white font-bold py-3 rounded-lg shadow-sm flex justify-center items-center">
                        Submit Form
                     </button>
                  </div>
               </div>
            </div>
         </div>

         {/* Sidebar: Properties */}
         <div className="w-80 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 overflow-y-auto p-6 flex-shrink-0">
            {selectedElement ? (
               <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-3">
                     <h3 className="text-sm font-bold text-navy-900 dark:text-white">Properties</h3>
                     <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-gray-500 dark:text-gray-300 uppercase font-semibold">{selectedElement.type}</span>
                  </div>
                  
                  <div>
                     <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Field Label</label>
                     <input 
                       type="text" 
                       value={selectedElement.label} 
                       onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })}
                       className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:border-navy-500 focus:ring-navy-500 border p-2 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                     />
                  </div>

                  <div>
                     <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        {selectedElement.type === 'terms' ? 'Terms Text (Agreement)' : 'Placeholder Text'}
                     </label>
                     {selectedElement.type === 'terms' ? (
                        <textarea
                           value={selectedElement.placeholder || ''} 
                           rows={4}
                           onChange={(e) => updateElement(selectedElement.id, { placeholder: e.target.value })}
                           className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:border-navy-500 focus:ring-navy-500 border p-2 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                        />
                     ) : (
                        <input 
                           type="text" 
                           value={selectedElement.placeholder || ''} 
                           onChange={(e) => updateElement(selectedElement.id, { placeholder: e.target.value })}
                           className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:border-navy-500 focus:ring-navy-500 border p-2 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                        />
                     )}
                  </div>

                  <div className="flex items-center bg-gray-50 dark:bg-slate-700 p-3 rounded-lg border border-gray-100 dark:border-slate-600">
                     <input 
                       id="req-check"
                       type="checkbox" 
                       checked={selectedElement.required}
                       onChange={(e) => updateElement(selectedElement.id, { required: e.target.checked })}
                       className="h-4 w-4 text-navy-600 focus:ring-navy-500 border-gray-300 rounded bg-white"
                     />
                     <label htmlFor="req-check" className="ml-2 block text-sm text-gray-700 dark:text-gray-300 font-medium cursor-pointer">Required Field</label>
                  </div>

                  {selectedElement.type !== 'terms' && (
                     <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-2">
                           <Database size={14} className="text-brand-orange" />
                           <label className="block text-xs font-bold text-navy-900 dark:text-white">CRM Data Mapping</label>
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">Automatically save data from this field to the contact's record.</p>
                        <select 
                        value={selectedElement.mappingKey || ''}
                        onChange={(e) => updateElement(selectedElement.id, { mappingKey: e.target.value })}
                        className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-md shadow-sm focus:border-navy-500 focus:ring-navy-500 border p-2 bg-white dark:bg-slate-700 text-navy-900 dark:text-white"
                        >
                           <option value="">No Mapping</option>
                           <option value="fullName">Full Name</option>
                           <option value="email">Email Address</option>
                           <option value="phone">Phone Number</option>
                           <option value="dob">Date of Birth</option>
                           <option value="address">Address</option>
                           <option value="lender">Lender Name</option>
                           <option value="claimValue">Claim Value</option>
                           <option value="signature">Signature File</option>
                        </select>
                     </div>
                  )}
               </div>
            ) : (
               <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                  <Edit size={32} className="mb-3 opacity-20" />
                  <p className="text-sm">Select an element on the canvas<br/>to edit its properties.</p>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

const ToolboxItem = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick: () => void }) => (
   <button 
     onClick={onClick}
     className="flex flex-col items-center justify-center p-3 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-500 transition-all text-gray-600 dark:text-gray-300 hover:text-navy-700 dark:hover:text-white bg-white dark:bg-slate-800"
   >
      <Icon size={20} className="mb-2" />
      <span className="text-xs font-medium">{label}</span>
   </button>
);

// --- Form Preview Component with Signature Pad ---

const FormPreview: React.FC<{ form: Form, onClose: () => void }> = ({ form, onClose }) => {
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const [isDrawing, setIsDrawing] = useState(false);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [isSubmitted, setIsSubmitted] = useState(false);

   // Function to get scaled coordinates for accurate mouse position
   const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      return {
         x: (e.clientX - rect.left) * scaleX,
         y: (e.clientY - rect.top) * scaleY
      };
   };

   // Simple Signature Pad Logic
   const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Styling for smoother "pen-like" feel
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.shadowBlur = 1;
      ctx.shadowColor = '#000';
      
      const { x, y } = getCoordinates(e);
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
   };

   const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const { x, y } = getCoordinates(e);
      
      ctx.lineTo(x, y);
      ctx.stroke();
   };

   const stopDrawing = () => {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
         const ctx = canvas.getContext('2d');
         if (ctx) ctx.closePath();
      }
   };

   const clearSignature = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
   };

   const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      // Simulate API call
      setTimeout(() => {
         setIsSubmitting(false);
         setIsSubmitted(true);
      }, 1500);
   };

   if (isSubmitted) {
      return (
         <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col items-center justify-center">
            <div className="text-center p-8 max-w-md">
               <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} />
               </div>
               <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-2">Form Submitted!</h2>
               <p className="text-gray-500 dark:text-gray-400 mb-6">Thank you. Your information has been successfully recorded in the preview simulation.</p>
               <button onClick={onClose} className="px-6 py-2 bg-navy-700 text-white rounded-lg hover:bg-navy-800 transition-colors">
                  Return to Builder
               </button>
            </div>
         </div>
      );
   }

   return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
         <div className="h-16 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-navy-50 dark:bg-slate-800 flex-shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={onClose} className="text-gray-500 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white transition-colors flex items-center gap-2 group">
                   <div className="p-1.5 rounded-full group-hover:bg-gray-200/50 dark:group-hover:bg-slate-700">
                      <ArrowLeft size={20} />
                   </div>
                   <span className="font-medium text-sm">Back</span>
                </button>
                <div className="h-6 w-px bg-gray-300 dark:bg-slate-600"></div>
                <h2 className="font-bold text-navy-900 dark:text-white">Preview: {form.name}</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
               <X size={24} />
            </button>
         </div>
         <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-8 flex justify-center pb-32">
            <div className="bg-white w-full max-w-2xl shadow-lg rounded-xl p-10 border border-gray-200 h-fit">
               <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-navy-900 mb-3">{form.name}</h1>
                  <p className="text-gray-500 text-lg leading-relaxed">{form.description}</p>
               </div>
               
               <form onSubmit={handleSubmit} className="space-y-8">
                  {form.elements.map(el => (
                     <div key={el.id}>
                        <label className="block text-sm font-bold text-gray-800 mb-2">
                           {el.label} {el.required && <span className="text-red-500">*</span>}
                        </label>
                        
                        {el.type === 'text' && <input type="text" required={el.required} placeholder={el.placeholder} className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all" />}
                        {el.type === 'textarea' && <textarea required={el.required} placeholder={el.placeholder} rows={4} className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all" />}
                        {el.type === 'number' && <input type="number" required={el.required} className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all" />}
                        {el.type === 'date' && <input type="date" required={el.required} className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all" />}
                        {el.type === 'file' && <input type="file" required={el.required} className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all" />}
                        
                        {el.type === 'signature' && (
                           <div className="border border-gray-300 rounded-lg bg-white overflow-hidden w-full shadow-sm">
                              <canvas 
                                 ref={canvasRef}
                                 className="w-full h-48 touch-none cursor-crosshair bg-gray-50 hover:bg-gray-100/50 transition-colors"
                                 onMouseDown={startDrawing}
                                 onMouseMove={draw}
                                 onMouseUp={stopDrawing}
                                 onMouseLeave={stopDrawing}
                                 // Setting logical resolution, CSS handles display size
                                 width={600} 
                                 height={200}
                              />
                              <div className="bg-gray-50 border-t border-gray-200 p-3 flex justify-between items-center rounded-b-lg">
                                 <span className="text-xs text-gray-500 font-medium ml-2">Sign above using mouse or touch</span>
                                 <button type="button" onClick={clearSignature} className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1 hover:bg-red-50 rounded transition-colors">Clear Signature</button>
                              </div>
                           </div>
                        )}

                        {el.type === 'checkbox' && (
                           <div className="flex items-center">
                              <input type="checkbox" required={el.required} className="h-5 w-5 text-navy-600 border-gray-300 rounded focus:ring-navy-500 bg-white cursor-pointer" />
                              <span className="ml-3 text-sm text-gray-700">{el.placeholder || 'Yes'}</span>
                           </div>
                        )}

                        {el.type === 'terms' && (
                           <div className="flex items-start p-5 bg-gray-50 rounded-xl border border-gray-200">
                              <input type="checkbox" required={el.required} className="mt-1 h-5 w-5 text-navy-600 border-gray-300 rounded focus:ring-navy-500 bg-white cursor-pointer" />
                              <p className="ml-4 text-sm text-gray-600 leading-relaxed">{el.placeholder || 'I agree to the Terms and Conditions.'}</p>
                           </div>
                        )}
                        
                        {el.type === 'select' && (
                           <select className="w-full border-gray-300 rounded-lg shadow-sm px-4 py-3 border focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white text-gray-900 transition-all">
                              <option>Select an option...</option>
                              <option>Option 1</option>
                              <option>Option 2</option>
                           </select>
                        )}
                     </div>
                  ))}
                  
                  <div className="pt-8">
                     <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-brand-orange hover:bg-amber-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center text-lg"
                     >
                        {isSubmitting ? 'Submitting...' : 'Submit Form'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
      </div>
   );
}

export default Forms;
