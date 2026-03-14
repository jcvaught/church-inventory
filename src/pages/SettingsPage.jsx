import { useState, useContext } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Spinner } from '../components/primitives/Spinner.jsx';

export function SettingsPage({ store, userProfile, subscription, user }) {
  const { settings, config, users, updateSettings, updateConfig, updateUser, removeUser, submitSuggestion, loadSuggestions } = store;
  const isMobile = useContext(MobileCtx);
  const [editList, setEditList] = useState(null); // { key, title, items }
  const [newItem, setNewItem] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [editCodeMode, setEditCodeMode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionCategory, setSuggestionCategory] = useState("Feature Request");
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [allSuggestions, setAllSuggestions] = useState(null);
  const [suggestionFilter, setSuggestionFilter] = useState("All");
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const isOwner = ['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(user?.email);

  if (!settings || !config) return <Spinner />;

  function openListEditor(key, title) {
    setEditList({ key, title, items: [...(settings[key] || [])] });
    setNewItem("");
  }
  function addToList() {
    if (!newItem.trim() || editList.items.includes(newItem.trim())) return;
    const updated = [...editList.items, newItem.trim()];
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
    setNewItem("");
  }
  function removeFromList(item) {
    const updated = editList.items.filter(i => i !== item);
    setEditList({ ...editList, items: updated });
    updateSettings({ [editList.key]: updated });
  }
  function handleChangeCode() {
    if (newCode.trim().length < 3) return;
    if (!window.confirm(`Change the church code to "${newCode.trim().toUpperCase()}"? Anyone using the old code to join will no longer be able to.`)) return;
    updateConfig({ churchCode: newCode.trim().toUpperCase() });
    setEditCodeMode(false);
    setNewCode("");
  }

  async function handleSubmitSuggestion() {
    if (!suggestionText.trim()) return;
    setSuggestionLoading(true);
    await submitSuggestion(suggestionText.trim(), suggestionCategory, userProfile?.id, userProfile?.name, config?.churchName);
    setSuggestionLoading(false);
    setSuggestionText("");
    setSuggestionSent(true);
    setTimeout(() => setSuggestionSent(false), 4000);
  }

  async function handleLoadSuggestions() {
    setLoadingSuggestions(true);
    const results = await loadSuggestions();
    setAllSuggestions(results);
    setLoadingSuggestions(false);
  }

  const isAdmin = userProfile?.role === "admin";
  const listCard = (key, title, icon) => {
    const items = settings[key] || [];
    return (
      <div style={{ background:B.white, borderRadius:14, padding:"20px 22px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>{icon} {title}</h3>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:B.textLight }}>{items.length} items</span>
            {isAdmin && <button onClick={() => openListEditor(key, title)} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Edit</button>}
          </div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {items.slice(0, 12).map(item => (
            <span key={item} style={{ padding:"4px 12px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{item}</span>
          ))}
          {items.length > 12 && <span style={{ padding:"4px 12px", fontSize:12, color:B.textLight }}>+{items.length - 12} more</span>}
        </div>
      </div>
    );
  };

  const planLabel = !subscription ? 'Free' : subscription.plan === 'free' ? 'Free' : subscription.plan === 'all_in' ? 'All-In' : subscription.plan === 'team_unlimited' ? 'Team Unlimited' : subscription.plan;
  const activeHubs = subscription?.grandfathered ? ['All hubs (grandfathered)'] : (subscription?.hubs || []);

  return (
    <div>
      <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:"0 0 20px" }}>Settings</h2>

      {/* Subscription & Billing */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Subscription & Billing</h3>
          {isAdmin && (
            <a href="mailto:jcvaught@gmail.com?subject=Upgrade ChurchOpsHub Plan" style={{ ...btnP, padding:"6px 14px", fontSize:12, textDecoration:"none", display:"inline-block" }}>Upgrade</a>
          )}
        </div>
        <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Current Plan</div>
            <div style={{ fontSize:15, fontWeight:700, color:B.navy }}>{planLabel}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Status</div>
            <div style={{ fontSize:15, fontWeight:600, color: subscription?.status === 'active' || subscription?.status === 'trialing' ? B.teal : B.red }}>
              {subscription?.status || 'active'}
            </div>
          </div>
          {activeHubs.length > 0 && (
            <div>
              <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Active Hubs</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {activeHubs.map(h => (
                  <span key={h} style={{ padding:"2px 10px", borderRadius:20, background:B.tealPale, color:B.teal, fontSize:12, fontWeight:600, fontFamily:f1 }}>{h}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        {planLabel === 'Free' && (
          <p style={{ color:B.textLight, fontSize:13, marginTop:12, marginBottom:0 }}>
            Add hubs like <strong>Maintenance</strong> to unlock advanced features. <a href="mailto:jcvaught@gmail.com" style={{ color:B.teal, textDecoration:"none", fontWeight:600 }}>Contact us</a> to start a free 30-day trial.
          </p>
        )}
      </div>

      {/* Church Info */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 16px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Church Info</h3>
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Name</div>
            <div style={{ fontSize:16, fontWeight:600 }}>{config.churchName}</div>
          </div>
          <div>
            <div style={{ fontSize:12, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:3 }}>Church Code</div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {editCodeMode ? (
                <>
                  <input style={{...inp, width:150, fontFamily:"monospace", letterSpacing:2, textTransform:"uppercase", padding:"7px 12px"}} value={newCode} onChange={e=>setNewCode(e.target.value)} placeholder="NEW CODE"/>
                  <button onClick={handleChangeCode} style={{...btnP, padding:"7px 14px", fontSize:12}}>Save</button>
                  <button onClick={()=>setEditCodeMode(false)} style={{...btnS, padding:"7px 14px", fontSize:12}}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize:16, fontWeight:700, fontFamily:"monospace", letterSpacing:2, color: showCode ? B.navy : B.textLight }}>
                    {showCode ? config.churchCode : "••••••••"}
                  </span>
                  <button onClick={()=>setShowCode(!showCode)} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>
                    {showCode ? "Hide" : "Show"}
                  </button>
                  <button onClick={()=>{ navigator.clipboard.writeText(config.churchCode||""); setCodeCopied(true); setTimeout(()=>setCodeCopied(false), 2000); }} style={{ background:"none", border:"none", color:codeCopied?B.teal:B.textMid, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>
                    {codeCopied ? "Copied!" : "Copy"}
                  </button>
                  {userProfile?.role === "admin" && (
                    <button onClick={()=>{setEditCodeMode(true);setNewCode(config.churchCode||"");}} style={{ background:"none", border:"none", color:B.teal, cursor:"pointer", fontSize:12, fontFamily:f1, fontWeight:600 }}>Change</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Managed Lists */}
      <div style={{ display:"grid", gap:16, marginBottom:20 }}>
        {listCard("locations", "Locations", "📍")}
        {listCard("ministries", "Ministries", "⛪")}
        {listCard("tags", "Tags", "🏷️")}
      </div>

      {/* Team Members */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Team Members</h3>
        </div>
        {users.length === 0 ? <p style={{ color:B.textLight, fontSize:14 }}>No team members yet.</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {users.map(u => (
              <div key={u.id} style={{ padding:"12px 14px", borderRadius:10, background:B.warmGray }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:B.teal, display:"flex", alignItems:"center", justifyContent:"center", color:B.white, fontWeight:700, fontSize:14, fontFamily:f1, flexShrink:0 }}>{(u.name||"?")[0]}</div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        {u.name}
                        <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, fontFamily:f1, background: u.role==="admin"?B.goldLight:B.tealPale, color:u.role==="admin"?"#96750E":B.teal }}>{u.role}</span>
                        {!u.active && <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:600, background:B.redPale, color:B.red }}>Inactive</span>}
                      </div>
                      <div style={{ fontSize:12, color:B.textLight }}>{u.email}</div>
                    </div>
                  </div>
                </div>
                {isAdmin && u.id !== userProfile.id && (
                  <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                    <button onClick={()=>{ if(window.confirm(u.role==="admin" ? `Remove admin from ${u.name}? They will become a regular user.` : `Make ${u.name} an admin? They will have full access to all settings and data.`)) updateUser(u.id, {role: u.role==="admin" ? "user" : "admin"}); }}
                      style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color: u.role==="admin" ? B.textMid : "#96750E", borderColor: u.role==="admin" ? B.sand : B.gold }}>
                      {u.role==="admin" ? "Remove Admin" : "Make Admin"}
                    </button>
                    {u.active ? (
                      <button onClick={()=>{ if(window.confirm(`Deactivate ${u.name}? They will lose access to the app immediately.`)) updateUser(u.id, {active:false}); }} style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.red, borderColor:"#FECACA" }}>Deactivate</button>
                    ) : (
                      <button onClick={()=>updateUser(u.id, {active:true})} style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.teal, borderColor:B.tealPale }}>Reactivate</button>
                    )}
                    <button onClick={()=>{ if(window.confirm(`Remove ${u.name} from your church? They will no longer have access.`)) removeUser(u.id); }}
                      style={{ ...btnS, flex:isMobile?"1 1 auto":undefined, padding:"6px 14px", fontSize:12, color:B.red, borderColor:"#FECACA" }}>Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        }
      </div>

      {/* Suggestions Report — owner only */}
      {isOwner && (
        <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Suggestions Report</h3>
            <button onClick={handleLoadSuggestions} disabled={loadingSuggestions} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>
              {loadingSuggestions ? "Loading…" : allSuggestions ? "Refresh" : "Load Suggestions"}
            </button>
          </div>
          {allSuggestions && (
            <>
              <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
                {["All","Feature Request","Bug Report","Other"].map(cat => {
                  const count = cat === "All" ? allSuggestions.length : allSuggestions.filter(s => s.category === cat).length;
                  return (
                    <button key={cat} onClick={() => setSuggestionFilter(cat)}
                      style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, borderRadius:20, border:"1px solid "+(suggestionFilter===cat?B.teal:B.sand), background:suggestionFilter===cat?B.tealPale:B.white, color:suggestionFilter===cat?B.teal:B.textMid, cursor:"pointer" }}>
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
              {(() => {
                const filtered = suggestionFilter === "All" ? allSuggestions : allSuggestions.filter(s => s.category === suggestionFilter);
                if (filtered.length === 0) return <p style={{ color:B.textLight, fontSize:14 }}>No suggestions in this category.</p>;
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:480, overflowY:"auto" }}>
                    {filtered.map(s => (
                      <div key={s.id} style={{ padding:"12px 14px", borderRadius:10, background:B.warmGray }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:6 }}>
                          <span style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:600, fontFamily:f1,
                            background: s.category==="Bug Report"?B.redPale:s.category==="Feature Request"?B.tealPale:B.goldLight,
                            color: s.category==="Bug Report"?B.red:s.category==="Feature Request"?B.teal:"#96750E" }}>
                            {s.category}
                          </span>
                          <span style={{ fontSize:11, color:B.textLight }}>{s.churchName} · {s.submittedByName} · {s.submittedAt?.split("T")[0]}</span>
                        </div>
                        <p style={{ margin:0, fontSize:14, color:B.textDark, fontFamily:f2 }}>{s.text}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}
          {!allSuggestions && <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Click "Load Suggestions" to see all submitted feedback.</p>}
        </div>
      )}

      {/* Suggestions */}
      <div style={{ background:B.white, borderRadius:14, padding:"22px 24px", border:"1px solid "+B.sand, marginTop:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <h3 style={{ margin:"0 0 6px", fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Submit a Suggestion</h3>
        <p style={{ margin:"0 0 14px", fontSize:13, color:B.textLight }}>Have an idea or found a bug? We'd love to hear from you.</p>
        {suggestionSent ? (
          <div style={{ background:B.tealPale, border:"1px solid "+B.teal, borderRadius:10, padding:"14px 18px", color:B.teal, fontWeight:600, fontFamily:f1, fontSize:14 }}>
            Thanks for your feedback! We read every suggestion.
          </div>
        ) : (
          <>
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {["Feature Request","Bug Report","Other"].map(cat => (
                <button key={cat} onClick={() => setSuggestionCategory(cat)}
                  style={{ padding:"5px 14px", fontSize:12, fontFamily:f1, fontWeight:600, borderRadius:20, border:"1px solid "+(suggestionCategory===cat?B.teal:B.sand), background:suggestionCategory===cat?B.tealPale:B.white, color:suggestionCategory===cat?B.teal:B.textMid, cursor:"pointer" }}>
                  {cat}
                </button>
              ))}
            </div>
            <textarea
              value={suggestionText}
              onChange={e => setSuggestionText(e.target.value)}
              placeholder="Describe your idea or issue..."
              rows={4}
              style={{ ...inp, width:"100%", resize:"vertical", fontFamily:f2, fontSize:14, boxSizing:"border-box" }}
            />
            <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={handleSubmitSuggestion} disabled={!suggestionText.trim() || suggestionLoading}
                style={{ ...btnP, opacity:(!suggestionText.trim()||suggestionLoading)?0.5:1 }}>
                {suggestionLoading ? "Sending…" : "Send Suggestion"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* List Editor Modal */}
      <Modal open={!!editList} onClose={()=>setEditList(null)} title={"Manage " + (editList?.title || "")}>
        {editList && <>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <input style={{...inp, flex:1}} value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder={`Add new ${editList.title.toLowerCase().slice(0,-1)}...`} onKeyDown={e=>e.key==="Enter"&&addToList()}/>
            <button onClick={addToList} disabled={!newItem.trim()} style={{ ...btnP, opacity:newItem.trim()?1:.5 }}>Add</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:400, overflowY:"auto" }}>
            {editList.items.map(item => (
              <div key={item} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 14px", borderRadius:8, background:B.warmGray }}>
                <span style={{ fontSize:14 }}>{item}</span>
                <button onClick={()=>removeFromList(item)} style={{ background:"none", border:"none", color:B.red, cursor:"pointer", fontSize:16, padding:"2px 6px" }}>&times;</button>
              </div>
            ))}
          </div>
          {editList.items.length === 0 && <p style={{ color:B.textLight, fontSize:14, textAlign:"center", padding:20 }}>No items yet. Add some above.</p>}
        </>}
      </Modal>
    </div>
  );
}
