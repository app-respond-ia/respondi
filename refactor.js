const fs = require('fs');
const file = 'src/app/dashboard/chats/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add state
code = code.replace(
  'const [canDeleteNotes, setCanDeleteNotes] = useState(false)',
  'const [canDeleteNotes, setCanDeleteNotes] = useState(false)\n  const [showMobileContext, setShowMobileContext] = useState(false)'
);

// 2. Fix permissions
code = code.replace(
  "const isAdmin = perms.data.role === 'admin' || perms.data.role === 'owner'\n        const hasAudit = perms.data.permissions.includes('view_audit_log')",
  "const isAdmin = perms.esAdmin\n        const hasAudit = Array.isArray(perms.data) ? perms.data.some((p: any) => p.seccion === 'audit_log' && p.nivel !== 'ninguno') : false"
);

// 3. Extract renderContextContent
const contextStartStr = '<div className="p-5 flex flex-col gap-6">';
const contextStart = code.indexOf(contextStartStr);
// Find the end of this div by counting tags or just using string matching since we know exactly where it ends:
// The end is before:
//             </div>
//           ) : null}
//         </section>
const contextEndStr = '            </div>\n          ) : null}\n        </section>';
const contextEnd = code.indexOf(contextEndStr, contextStart);

const innerContext = code.substring(contextStart, contextEnd + '            </div>'.length);

const functionDef = `
  const renderContextContent = () => (
    ${innerContext.trim()}
  )

  return (`;

code = code.replace(
  `  return (\n    <div className="flex-1`,
  `${functionDef}\n    <div className="flex-1`
);

// Replace the extracted part with a function call
code = code.replace(
  innerContext,
  '{contexto ? renderContextContent() : null}'
);

// 4. Add the 'i' button
const buttonTarget = '{/* Botones de acción derecha */}\n              <div className="flex items-center gap-2 relative">';
const buttonTarget2 = '<div className="flex items-center gap-3 shrink-0">';
code = code.replace(
  buttonTarget2,
  `${buttonTarget2}\n                <button onClick={() => setShowMobileContext(true)} className="xl:hidden p-2 -mr-1 rounded-lg text-ink-500 hover:bg-slate-100 transition" aria-label="Ver contexto">\n                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">\n                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />\n                  </svg>\n                </button>`
);

// 5. Append drawer
const drawerCode = `
      {/* Drawer Contexto Móvil */}
      {showMobileContext && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <div className="absolute inset-0 bg-ink-900/50 transition-opacity" onClick={() => setShowMobileContext(false)}></div>
          <div className="relative w-80 max-w-[85vw] bg-slate-50 h-full flex flex-col overflow-y-auto animate-slide-left shadow-2xl">
            <div className="px-4 h-14 border-b border-slate-200 bg-white flex justify-between items-center sticky top-0 z-10 shrink-0">
              <h2 className="font-semibold text-ink-900">Contexto</h2>
              <button onClick={() => setShowMobileContext(false)} className="p-2 -mr-2 text-ink-500 hover:bg-slate-100 rounded-lg transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderContextContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
`;

// Replace the end of ChatsContent
code = code.replace(
  `    </div>\n  )\n}`,
  drawerCode
);

fs.writeFileSync(file, code);
console.log('Refactoring complete');
