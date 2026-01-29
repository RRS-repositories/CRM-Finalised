
import React, { useState, useRef, useEffect } from 'react';
import { 
  Folder, Plus, Search, LayoutGrid, List, File, Edit, ChevronRight, 
  Save, X, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Strikethrough, Link as LinkIcon, Image as ImageIcon,
  Table, Type, ListOrdered, List as ListBulleted, Undo, Redo,
  ChevronDown, Printer, FileText, CheckSquare, Calendar, GripVertical,
  RemoveFormatting, PenTool, Hash, Layout, Download, Play, Users, 
  Video, Minus, MousePointer2
} from 'lucide-react';
import { MOCK_TEMPLATE_FOLDERS, TEMPLATE_VARIABLES } from '../constants';
import { useCRM } from '../context/CRMContext';
import { Template, Contact } from '../types';

const Templates: React.FC = () => {
  // Use state from context
  const { templates, updateTemplate, addTemplate, contacts, addDocument } = useCRM();
  
  const [viewMode, setViewMode] = useState<'library' | 'editor'>('library');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Template type filter state (must be declared before any conditional returns)
  const [templateTypeFilter, setTemplateTypeFilter] = useState<'all' | 'email' | 'sms' | 'letter'>('email');

  // Editor State
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorCategory, setEditorCategory] = useState('Client');
  const [editorDescription, setEditorDescription] = useState('');
  
  // Rich Text Editor State
  const editorRef = useRef<HTMLDivElement>(null);
  const [showAddElementModal, setShowAddElementModal] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null); // For mapped fields

  // Generation Modal State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [templateToGenerate, setTemplateToGenerate] = useState<Template | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  // Preview Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Handle preview click
  const handlePreview = (template: Template) => {
    setPreviewTemplate(template);
    setShowPreviewModal(true);
  };

  // Initialize editor with content
  useEffect(() => {
    if (viewMode === 'editor' && editorRef.current) {
        let initialContent = '';
        if (currentTemplate) {
            // Check if content is HTML-ish
            if (currentTemplate.content.trim().startsWith('<')) {
                initialContent = currentTemplate.content;
            } else {
                // Convert plain text to paragraphs
                initialContent = currentTemplate.content
                    .split('\n')
                    .map(line => line.trim() ? `<p>${line}</p>` : '<p><br/></p>')
                    .join('');
            }
        } else {
            initialContent = '<p><br/></p>';
        }
        editorRef.current.innerHTML = initialContent;
        
        // Add click listeners to mappable elements
        attachClickListeners();
    }
  }, [viewMode, currentTemplate]);

  // Re-attach listeners when content changes (simplified)
  const attachClickListeners = () => {
      if(!editorRef.current) return;
      const mappables = editorRef.current.querySelectorAll('.mappable-field');
      mappables.forEach((el: any) => {
          el.onclick = (e: Event) => {
              e.stopPropagation();
              // Highlight selection
              editorRef.current?.querySelectorAll('.mappable-field').forEach(f => (f as HTMLElement).style.outline = 'none');
              el.style.outline = '2px solid #3b82f6';
              setSelectedElementId(el.id);
          };
      });
  };

  const handleEdit = (template: Template) => {
    setCurrentTemplate(template);
    setEditorName(template.name);
    setEditorCategory(template.category);
    setEditorDescription(template.description);
    setViewMode('editor');
  };

  const handleNew = () => {
    setCurrentTemplate(null);
    setEditorName('New Template');
    setEditorCategory('Client');
    setEditorDescription('');
    setViewMode('editor');
  };

  const handleSave = () => {
    const timestamp = new Date().toISOString().split('T')[0];
    const content = editorRef.current?.innerHTML || '';
    
    if (currentTemplate) {
      updateTemplate({
        ...currentTemplate,
        name: editorName,
        category: editorCategory,
        description: editorDescription,
        content: content,
        lastModified: timestamp
      });
    } else {
      addTemplate({
        name: editorName,
        category: editorCategory,
        description: editorDescription,
        content: content
      });
    }

    setViewMode('library');
  };

  const handleUseTemplate = (template: Template) => {
    setTemplateToGenerate(template);
    setSelectedContactId(contacts.length > 0 ? contacts[0].id : '');
    setShowGenerateModal(true);
  };

  const confirmGenerate = () => {
    if (!templateToGenerate || !selectedContactId) return;

    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) return;

    // 1. Create a temporary container to manipulate HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = templateToGenerate.content;

    // 2. Replace Text Variables (Legacy {{...}})
    let content = tempDiv.innerHTML;
    const replacements: Record<string, string> = {
        '{{client.name}}': contact.fullName,
        '{{client.email}}': contact.email,
        '{{client.phone}}': contact.phone,
        '{{client.address}}': contact.address ? `${contact.address.line1}, ${contact.address.city}, ${contact.address.postalCode}` : 'Address Not on File',
        '{{client.dob}}': contact.dateOfBirth || 'DOB Not on File',
        '{{lender.name}}': contact.lender,
        '{{claim.reference}}': contact.id, 
        '{{claim.amount}}': `£${contact.claimValue}`,
        '{{date.today}}': new Date().toLocaleDateString(),
    };

    Object.keys(replacements).forEach(key => {
        content = content.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacements[key]);
    });
    
    // Refresh tempDiv with string replaced content
    tempDiv.innerHTML = content;

    // 3. Process Mapped Fields (New System)
    const mappables = tempDiv.querySelectorAll('.mappable-field');
    mappables.forEach((el: any) => {
        const mappingKey = el.dataset.mapping;
        const type = el.dataset.type;

        if (mappingKey) {
            let value = '';
            
            // Resolve value from contact object
            if (mappingKey === 'fullName') value = contact.fullName;
            if (mappingKey === 'email') value = contact.email;
            if (mappingKey === 'phone') value = contact.phone;
            if (mappingKey === 'lender') value = contact.lender;
            if (mappingKey === 'claimValue') value = contact.claimValue.toString();
            if (mappingKey === 'address') value = contact.address ? `${contact.address.line1}, ${contact.address.city}, ${contact.address.postalCode}` : '';
            if (mappingKey === 'dob') value = contact.dateOfBirth || '';
            if (mappingKey === 'date.today') value = new Date().toLocaleDateString();
            
            // Check for signature in customFields
            if (mappingKey === 'signature') {
               value = contact.customFields?.signature || 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Signature_sample.svg';
            }

            // Render logic
            if (type === 'signature' && value.startsWith('data:image')) {
                // Handle Base64 signature
                const img = document.createElement('img');
                img.src = value;
                img.style.maxHeight = '60px';
                img.style.maxWidth = '200px';
                el.replaceWith(img);
            } else if (type === 'signature' && value.startsWith('http')) {
                // Handle URL signature
                const img = document.createElement('img');
                img.src = value;
                img.style.maxHeight = '60px';
                img.style.maxWidth = '200px';
                el.replaceWith(img);
            } else if (type === 'checkbox') {
                // Replace with Checked Box icon if true (mock always true for demo)
                const span = document.createElement('span');
                span.innerHTML = '☑';
                span.style.fontFamily = 'monospace';
                span.style.fontSize = '1.2em';
                el.replaceWith(span);
            } else {
                // Replace with text
                const span = document.createElement('span');
                span.innerText = value || '________________'; // Fallback to underline
                span.style.fontWeight = 'bold'; // Make filled data bold
                el.replaceWith(span);
            }
        }
    });

    // 4. Create Document
    addDocument({
        name: `${templateToGenerate.name} - ${contact.fullName}.html`, 
        category: 'Client',
        type: 'html',
        associatedContactId: contact.id,
        size: '15 KB',
        version: 1,
        content: tempDiv.innerHTML // Store generated HTML
    });

    setShowGenerateModal(false);
    setTemplateToGenerate(null);
  };

  // --- Rich Text Commands ---

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const insertHtmlAtCursor = (html: string) => {
      if (document.activeElement === editorRef.current || editorRef.current?.contains(document.activeElement)) {
          execCmd('insertHTML', html);
      } else {
          editorRef.current?.insertAdjacentHTML('beforeend', html);
      }
      // Re-attach listeners for new elements
      setTimeout(attachClickListeners, 100);
  };

  const handleInsertVariable = (variableKey: string) => {
    const html = `<span style="background-color: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; user-select: all;" contenteditable="false">${variableKey}</span>&nbsp;`;
    insertHtmlAtCursor(html);
  };

  const insertImage = () => {
    const url = prompt('Enter image URL (e.g., logo):', 'https://via.placeholder.com/150');
    if (url) {
        const html = `<img src="${url}" style="max-width: 100%; height: auto; border: 1px solid #eee;" />`;
        insertHtmlAtCursor(html);
    }
  };

  const insertTable = () => {
    const html = `
      <table style="width:100%; border-collapse: collapse; border: 1px solid #d1d5db; margin: 1em 0;">
        <tbody>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Item</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Description</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">Cost</td>
          </tr>
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 8px;">&nbsp;</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">&nbsp;</td>
            <td style="border: 1px solid #d1d5db; padding: 8px;">&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <p><br/></p>
    `;
    insertHtmlAtCursor(html);
  };

  // Improved Element Insertion with Mapping Capabilities
  const insertMappableElement = (type: 'signature' | 'date' | 'text' | 'checkbox' | 'initials') => {
      const id = `field_${Date.now()}`;
      let html = '';
      
      const commonStyle = `
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        border: 1px dashed #9ca3af; 
        background-color: #f3f4f6; 
        padding: 4px 8px; 
        margin: 0 4px; 
        border-radius: 4px; 
        cursor: pointer;
        font-size: 12px;
        color: #4b5563;
        min-width: 100px;
        user-select: none;
      `;

      switch(type) {
          case 'signature':
              html = `<div id="${id}" class="mappable-field" data-type="signature" data-mapping="" contenteditable="false" style="${commonStyle}; height: 40px; background-color: #eff6ff; border-color: #3b82f6;">
                <span style="pointer-events:none">✍️ Signature Field</span>
              </div>`;
              break;
          case 'date':
              html = `<div id="${id}" class="mappable-field" data-type="date" data-mapping="date.today" contenteditable="false" style="${commonStyle}">
                <span style="pointer-events:none">📅 Date Field</span>
              </div>`;
              break;
          case 'checkbox':
              html = `<div id="${id}" class="mappable-field" data-type="checkbox" data-mapping="" contenteditable="false" style="${commonStyle}; min-width: 20px; width: 20px; height: 20px; padding: 0;">
                <span style="pointer-events:none">☑</span>
              </div>`;
              break;
          case 'text':
              html = `<div id="${id}" class="mappable-field" data-type="text" data-mapping="" contenteditable="false" style="${commonStyle}; background-color: #fff; border-bottom: 2px solid #ccc; border-top:none; border-left:none; border-right:none; border-radius: 0;">
                <span style="pointer-events:none; font-style:italic; opacity: 0.5;">Text Field</span>
              </div>`;
              break;
          case 'initials':
              html = `<div id="${id}" class="mappable-field" data-type="initials" data-mapping="" contenteditable="false" style="${commonStyle}; min-width: 40px;">
                <span style="pointer-events:none">Initials</span>
              </div>`;
              break;
      }
      insertHtmlAtCursor(html);
      setShowAddElementModal(false);
  };

  const updateSelectedFieldMapping = (mappingKey: string) => {
      if(!selectedElementId || !editorRef.current) return;
      const el = editorRef.current.querySelector(`#${selectedElementId}`) as HTMLElement;
      if(el) {
          el.dataset.mapping = mappingKey;
          // Update visual label
          const span = el.querySelector('span');
          if(span) span.innerText = `${el.dataset.type?.toUpperCase()}: ${mappingKey}`;
          
          // Re-trigger visual update
          el.click(); 
      }
  };

  // --- Renderers ---

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Editor View
  if (viewMode === 'editor') {
    return (
      <div className="flex flex-col h-full bg-[#F3F4F6]">
        {/* Top Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm z-30">
          <div className="flex items-center gap-4">
             <div onClick={() => setViewMode('library')} className="p-2 hover:bg-gray-100 rounded-full cursor-pointer text-gray-500">
                <ChevronRight className="rotate-180" size={20} />
             </div>
             <div>
                <input 
                    type="text" 
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    className="font-bold text-lg text-gray-900 border-none focus:ring-0 p-0 hover:bg-gray-50 rounded px-2 -ml-2 bg-transparent"
                />
                <div className="flex items-center gap-4 text-xs text-gray-500 mt-0.5">
                    <span className="hover:text-navy-900 cursor-pointer">File</span>
                    <span className="hover:text-navy-900 cursor-pointer">Edit</span>
                    <span className="hover:text-navy-900 cursor-pointer">Insert</span>
                    <span className="hover:text-navy-900 cursor-pointer">View</span>
                </div>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="flex items-center bg-gray-100 rounded-lg p-1">
                 <select 
                    value={editorCategory}
                    onChange={(e) => setEditorCategory(e.target.value)}
                    className="bg-transparent text-xs font-medium text-gray-800 border-none focus:ring-0 cursor-pointer"
                 >
                    {MOCK_TEMPLATE_FOLDERS.map(f => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                 </select>
             </div>
             <button 
                onClick={handleSave}
                className="bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm"
             >
                <Save size={16} /> Save
             </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 overflow-x-auto shadow-sm z-20">
            <ToolbarBtn icon={Undo} onClick={() => execCmd('undo')} title="Undo" />
            <ToolbarBtn icon={Redo} onClick={() => execCmd('redo')} title="Redo" />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <select className="text-sm border border-gray-200 rounded px-2 py-1 mx-1 text-gray-800 hover:border-gray-300 focus:outline-none" onChange={(e) => execCmd('formatBlock', e.target.value)}>
                <option value="p">Normal</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
            </select>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolbarBtn icon={Bold} onClick={() => execCmd('bold')} title="Bold" />
            <ToolbarBtn icon={Italic} onClick={() => execCmd('italic')} title="Italic" />
            <ToolbarBtn icon={Underline} onClick={() => execCmd('underline')} title="Underline" />
            <ToolbarBtn icon={Strikethrough} onClick={() => execCmd('strikeThrough')} title="Strikethrough" />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolbarBtn icon={AlignLeft} onClick={() => execCmd('justifyLeft')} title="Align Left" />
            <ToolbarBtn icon={AlignCenter} onClick={() => execCmd('justifyCenter')} title="Align Center" />
            <ToolbarBtn icon={AlignRight} onClick={() => execCmd('justifyRight')} title="Align Right" />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolbarBtn icon={ListBulleted} onClick={() => execCmd('insertUnorderedList')} title="Bullet List" />
            <ToolbarBtn icon={ListOrdered} onClick={() => execCmd('insertOrderedList')} title="Numbered List" />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <ToolbarBtn icon={LinkIcon} onClick={() => { const url = prompt('URL:'); if(url) execCmd('createLink', url); }} title="Link" />
            <ToolbarBtn icon={ImageIcon} onClick={insertImage} title="Image" />
            <ToolbarBtn icon={Table} onClick={insertTable} title="Insert Table" />
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <div className="relative">
                <button 
                    onClick={() => setShowAddElementModal(!showAddElementModal)}
                    className="flex items-center gap-1 px-3 py-1 bg-brand-orange/10 text-brand-orange rounded hover:bg-brand-orange/20 text-xs font-bold transition-colors"
                >
                    <Plus size={14} /> Add Smart Field
                </button>
                {showAddElementModal && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
                        <button onClick={() => insertMappableElement('signature')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 text-gray-800">
                            <PenTool size={14} /> Signature
                        </button>
                        <button onClick={() => insertMappableElement('date')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 text-gray-800">
                            <Calendar size={14} /> Date Picker
                        </button>
                        <button onClick={() => insertMappableElement('text')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 text-gray-800">
                            <Type size={14} /> Text Field
                        </button>
                         <button onClick={() => insertMappableElement('checkbox')} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm flex items-center gap-2 text-gray-800">
                            <CheckSquare size={14} /> Checkbox
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-gray-100">
                <div 
                    className="bg-white w-[210mm] min-h-[297mm] shadow-lg p-[25mm] outline-none text-gray-900"
                    contentEditable
                    ref={editorRef}
                    suppressContentEditableWarning={true}
                    style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '12pt', lineHeight: '1.5' }}
                >
                    {/* Content injected via useEffect */}
                </div>
            </div>

            {/* Right Sidebar: Variable Mapping */}
            <div className="w-72 bg-white border-l border-gray-200 flex flex-col z-20">
                <div className="p-4 border-b border-gray-200 font-bold text-sm text-gray-900 bg-gray-50">
                    {selectedElementId ? 'Element Properties' : 'Data Variables'}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    {selectedElementId ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 mb-4">
                                You have selected a smart field. Map it to a CRM data point below.
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Map to Data Field</label>
                                <select 
                                    className="w-full text-sm border-gray-300 rounded-md shadow-sm p-2 bg-white text-gray-900"
                                    onChange={(e) => updateSelectedFieldMapping(e.target.value)}
                                >
                                    <option value="">-- Select Mapping --</option>
                                    <optgroup label="Client Details">
                                        <option value="fullName">Full Name</option>
                                        <option value="email">Email</option>
                                        <option value="address">Full Address</option>
                                        <option value="dob">Date of Birth</option>
                                    </optgroup>
                                    <optgroup label="Claim Details">
                                        <option value="lender">Lender Name</option>
                                        <option value="claimValue">Claim Value</option>
                                        <option value="claimReference">Reference Number</option>
                                    </optgroup>
                                    <optgroup label="System">
                                        <option value="date.today">Today's Date</option>
                                        <option value="signature">Signature (if avail)</option>
                                    </optgroup>
                                </select>
                            </div>

                            <button onClick={() => {
                                // Remove element logic could go here
                                const el = editorRef.current?.querySelector(`#${selectedElementId}`);
                                el?.remove();
                                setSelectedElementId(null);
                            }} className="w-full py-2 bg-red-50 text-red-600 rounded text-sm font-bold hover:bg-red-100 mt-4">
                                Remove Field
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {TEMPLATE_VARIABLES.map((group, idx) => (
                                <div key={idx}>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{group.category}</h4>
                                    <div className="space-y-1">
                                        {group.vars.map(v => (
                                            <button 
                                                key={v.key}
                                                onClick={() => handleInsertVariable(v.key)}
                                                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 rounded flex items-center justify-between group"
                                            >
                                                <span>{v.label}</span>
                                                <Plus size={14} className="text-gray-400 group-hover:text-blue-500" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    );
  }

  // Filter templates by type as well
  const typeFilteredTemplates = filteredTemplates.filter(t => {
    if (templateTypeFilter === 'all') return true;
    const name = t.name.toLowerCase();
    const desc = t.description?.toLowerCase() || '';
    if (templateTypeFilter === 'email') return name.includes('email') || desc.includes('email');
    if (templateTypeFilter === 'sms') return name.includes('sms') || desc.includes('sms');
    if (templateTypeFilter === 'letter') return name.includes('letter') || desc.includes('letter') || name.includes('loa') || name.includes('authority');
    return true;
  });

  // Library View (List/Table)
  return (
    <div className="flex h-full bg-white dark:bg-slate-900 relative">
      {/* Sidebar Folders */}
      <div className="w-56 border-r border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col">
         <div className="p-4 border-b border-gray-100 dark:border-slate-700">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Files & Generation</p>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folders</p>
         </div>

         <div className="flex-1 overflow-y-auto p-2">
            {MOCK_TEMPLATE_FOLDERS.map(folder => (
               <button
                 key={folder.id}
                 onClick={() => setSelectedFolderId(folder.id)}
                 className="w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors flex justify-between items-center bg-gray-100 dark:bg-slate-700 text-navy-700 dark:text-white"
               >
                  <div className="flex items-center gap-2">
                     <Folder size={14} className="text-yellow-500" />
                     {folder.name}
                  </div>
               </button>
            ))}
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
         {/* Toolbar with Search */}
         <div className="h-14 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between px-6 bg-white dark:bg-slate-800 flex-shrink-0">
            <div className="relative w-80">
               <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input
                 type="text"
                 placeholder="Search documents..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder:text-gray-400"
               />
            </div>
         </div>

         {/* Template Type Tabs */}
         <div className="px-6 py-4 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
               <button
                  onClick={() => setTemplateTypeFilter('email')}
                  className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                     templateTypeFilter === 'email'
                        ? 'bg-navy-700 border-navy-700 text-white'
                        : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
                  }`}
               >
                  Email Templates
               </button>
               <button
                  onClick={() => setTemplateTypeFilter('sms')}
                  className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                     templateTypeFilter === 'sms'
                        ? 'bg-navy-700 border-navy-700 text-white'
                        : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
                  }`}
               >
                  SMS Templates
               </button>
               <button
                  onClick={() => setTemplateTypeFilter('letter')}
                  className={`px-6 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                     templateTypeFilter === 'letter'
                        ? 'bg-navy-700 border-navy-700 text-white'
                        : 'bg-white dark:bg-slate-700 border-navy-700 dark:border-navy-500 text-navy-700 dark:text-navy-300 hover:bg-navy-50 dark:hover:bg-slate-600'
                  }`}
               >
                  Letter Templates
               </button>
            </div>
            <button
               onClick={handleNew}
               className="px-6 py-2.5 rounded-lg text-sm font-bold border-2 bg-white dark:bg-slate-700 border-green-600 dark:border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
            >
               Add new template
            </button>
         </div>

         {/* Templates Table */}
         <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
               <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {typeFilteredTemplates.length > 0 ? (
                     typeFilteredTemplates.map((template, index) => (
                        <div
                           key={template.id}
                           className={`
                              flex items-center justify-between px-5 py-4
                              ${index % 2 === 0
                                 ? 'bg-white dark:bg-slate-800'
                                 : 'bg-gray-50/50 dark:bg-slate-700/50'
                              }
                              hover:bg-indigo-50 dark:hover:bg-indigo-900/20
                              transition-all duration-200
                           `}
                        >
                           <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                 <FileText size={18} />
                              </div>
                              <button
                                 onClick={() => handlePreview(template)}
                                 className="text-sm font-semibold text-navy-700 dark:text-navy-300 hover:text-navy-900 dark:hover:text-navy-100 hover:underline transition-colors cursor-pointer"
                              >
                                 {template.name}
                              </button>
                           </div>
                           <div className="flex gap-2">
                              <button
                                 onClick={() => handleEdit(template)}
                                 className="px-4 py-1.5 text-sm font-medium border-2 border-navy-600 dark:border-navy-400 text-navy-600 dark:text-navy-400 rounded-lg hover:bg-navy-50 dark:hover:bg-navy-900/30 transition-colors"
                              >
                                 Edit
                              </button>
                              <button
                                 className="px-4 py-1.5 text-sm font-medium border-2 border-red-500 dark:border-red-400 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                              >
                                 Delete
                              </button>
                           </div>
                        </div>
                     ))
                  ) : (
                     <div className="px-5 py-16 text-center">
                        <File size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                        <p className="text-gray-400 dark:text-gray-500">No templates found matching your filters.</p>
                     </div>
                  )}
               </div>
            </div>
         </div>
      </div>

      {/* Generate Document Modal */}
      {showGenerateModal && templateToGenerate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-md p-6 border border-gray-200 dark:border-slate-700">
                <h3 className="font-bold text-lg mb-4 text-navy-900 dark:text-white">Generate Document</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                    Create a new document from <strong>{templateToGenerate.name}</strong>. Select a contact to populate fields.
                </p>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Contact</label>
                    <select
                        value={selectedContactId}
                        onChange={(e) => setSelectedContactId(e.target.value)}
                        className="w-full text-sm border-gray-300 dark:border-slate-600 rounded-lg shadow-sm p-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    >
                        {contacts.map(c => (
                            <option key={c.id} value={c.id}>{c.fullName} ({c.lender} Claim)</option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end gap-3">
                   <button onClick={() => setShowGenerateModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium">Cancel</button>
                   <button onClick={confirmGenerate} className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                      <Play size={16} /> Generate
                   </button>
                </div>
             </div>
          </div>
      )}

      {/* Template Preview Modal */}
      {showPreviewModal && previewTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
             <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                   <div>
                      <h3 className="font-bold text-lg text-navy-900 dark:text-white">{previewTemplate.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{previewTemplate.category} Template</p>
                   </div>
                   <button
                      onClick={() => setShowPreviewModal(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                   >
                      <X size={20} className="text-gray-500" />
                   </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                   <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      {previewTemplate.description && (
                         <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 pb-4 border-b border-gray-200 dark:border-slate-600">
                            <span className="font-semibold">Description:</span> {previewTemplate.description}
                         </p>
                      )}
                      <div
                         className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200"
                         dangerouslySetInnerHTML={{ __html: previewTemplate.content }}
                      />
                   </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3 flex-shrink-0">
                   <button
                      onClick={() => setShowPreviewModal(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium"
                   >
                      Close
                   </button>
                   <button
                      onClick={() => {
                         setShowPreviewModal(false);
                         handleEdit(previewTemplate);
                      }}
                      className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                   >
                      <Edit size={16} /> Edit Template
                   </button>
                </div>
             </div>
          </div>
      )}
    </div>
  );
};

const ToolbarBtn = ({ icon: Icon, onClick, title }: any) => (
    <button 
        onClick={onClick}
        title={title}
        className="p-1.5 text-gray-600 hover:text-navy-900 hover:bg-gray-100 rounded transition-colors"
    >
        <Icon size={16} />
    </button>
);

export default Templates;
