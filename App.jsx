// App.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase'; // 引入剛剛的 firebase 設定

export default function App() {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'received', 'form'
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // 表單狀態
  const initialForm = {
    category: '', name: '', manufacturer: '', shop: '',
    expectedDate: '', depositType: 'partial', balance: 0
  };
  const [formData, setFormData] = useState(initialForm);

  // 1. 從 Firestore 監聽資料即時更新
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "toys"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    });
    return () => unsubscribe();
  }, []);

  // 2. 提取過去輸入過的資料，作為 datalist 的下拉選單建議
  const uniqueCategories = [...new Set(items.map(i => i.category).filter(Boolean))];
  const uniqueManufacturers = [...new Set(items.map(i => i.manufacturer).filter(Boolean))];
  const uniqueShops = [...new Set(items.map(i => i.shop).filter(Boolean))];

  // 3. 處理日期排序 (將模糊日期轉為可排序的數字)
  const getSortValue = (dateStr) => {
    if (!dateStr || dateStr === '未知') return '9999-99-99'; // 未知排最後
    // 如果只有年份 '2026'，視為該年最後一天 '2026-12-31'
    if (dateStr.length === 4) return `${dateStr}-12-31`;
    // 如果只有年月 '2026-10'，視為該月最後一天 '2026-10-31'
    if (dateStr.length === 7) return `${dateStr}-31`;
    return dateStr;
  };

  // 分類清單並排序
  const pendingItems = items
    .filter(i => i.status === 'pending')
    .sort((a, b) => getSortValue(a.expectedDate).localeCompare(getSortValue(b.expectedDate)));

  const receivedItems = items
    .filter(i => i.status === 'received')
    .sort((a, b) => getSortValue(b.expectedDate).localeCompare(getSortValue(a.expectedDate))); // 取貨清單通常新到舊排

  // 4. 計算今月要付的尾款總數
  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    // 取得當前年月，格式為 "YYYY-MM" (例如 "2026-08")
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    return pendingItems.reduce((total, item) => {
      if (item.expectedDate && item.expectedDate.startsWith(currentYearMonth)) {
        return total + Number(item.balance || 0);
      }
      return total;
    }, 0);
  }, [pendingItems]);

  // 處理表單輸入
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // 如果選擇全款，尾款自動歸零
      balance: name === 'depositType' && value === 'full' ? 0 : prev.balance
    }));
  };

  // 儲存/更新玩具資料
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(doc(db, "toys", editingId), formData);
    } else {
      await addDoc(collection(db, "toys"), { ...formData, status: 'pending' });
    }
    setFormData(initialForm);
    setEditingId(null);
    setActiveTab('pending');
  };

  // 點擊編輯
  const handleEdit = (item) => {
    setFormData(item);
    setEditingId(item.id);
    setActiveTab('form');
  };

  // 切換已取貨狀態
  const handleToggleStatus = async (item) => {
    const newStatus = item.status === 'pending' ? 'received' : 'pending';
    await updateDoc(doc(db, "toys", item.id), { status: newStatus });
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 font-sans">
      <h1 className="text-2xl font-bold mb-6 text-center">📦 玩具預訂管理系統</h1>

      {/* Tabs 切換 */}
      <div className="flex space-x-2 mb-6 border-b pb-2 overflow-x-auto">
        {['pending', 'received', 'form'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab !== 'form') { setEditingId(null); setFormData(initialForm); }
            }}
            className={`px-4 py-2 rounded-t-lg whitespace-nowrap transition-colors ${
              activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {tab === 'pending' && '預訂清單'}
            {tab === 'received' && '已取貨清單'}
            {tab === 'form' && (editingId ? '✏️ 編輯玩具' : '➕ 新增預購玩具')}
          </button>
        ))}
      </div>

      {/* 預訂清單 */}
      {activeTab === 'pending' && (
        <div>
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded shadow-sm">
            <h2 className="text-lg font-bold text-red-700">
              🔥 今月 ({new Date().getMonth() + 1}月) 預計需付尾款總額：${thisMonthTotal.toLocaleString()}
            </h2>
          </div>

          <div className="space-y-4">
            {pendingItems.map(item => (
              <div key={item.id} className="flex items-center p-4 border rounded-lg shadow-sm bg-white">
                <div className="flex flex-col items-center mr-4 space-y-2">
                  <input 
                    type="checkbox" 
                    checked={item.status === 'received'}
                    onChange={() => handleToggleStatus(item)}
                    className="w-6 h-6 cursor-pointer"
                    title="標記為已取貨"
                  />
                  <button onClick={() => handleEdit(item)} className="text-blue-500 text-sm hover:underline">
                    編輯
                  </button>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-semibold bg-gray-200 px-2 py-1 rounded mr-2">{item.category}</span>
                      <h3 className="text-lg font-bold inline-block">{item.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{item.manufacturer} | {item.shop}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-500">出貨: {item.expectedDate || '未知'}</p>
                      <p className="text-lg font-bold text-red-600 mt-1">尾款: ${item.balance}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {pendingItems.length === 0 && <p className="text-center text-gray-500 py-10">目前沒有待收貨的玩具喔！</p>}
          </div>
        </div>
      )}

      {/* 已取貨清單 (復用類似設計，但可隱藏部分資訊) */}
      {activeTab === 'received' && (
        <div className="space-y-4 opacity-75">
           {receivedItems.map(item => (
              <div key={item.id} className="flex items-center p-4 border rounded-lg shadow-sm bg-gray-50">
                <div className="mr-4">
                  <input 
                    type="checkbox" 
                    checked={item.status === 'received'}
                    onChange={() => handleToggleStatus(item)}
                    className="w-6 h-6 cursor-pointer"
                  />
                </div>
                <div className="flex-1">
                  <span className="line-through text-gray-500 font-bold">{item.name}</span>
                  <p className="text-sm text-gray-500">{item.manufacturer} | {item.shop}</p>
                </div>
              </div>
           ))}
        </div>
      )}

      {/* 新增/編輯 表單 */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">玩具名稱 *</label>
              <input required name="name" value={formData.name} onChange={handleInputChange} className="w-full border p-2 rounded" />
            </div>
            
            {/* 種類 - 搭配 datalist */}
            <div>
              <label className="block text-sm font-medium mb-1">種類</label>
              <input name="category" list="category-list" value={formData.category} onChange={handleInputChange} className="w-full border p-2 rounded" placeholder="例如: 1/6 比例、景品" />
              <datalist id="category-list">{uniqueCategories.map(c => <option key={c} value={c} />)}</datalist>
            </div>

            {/* 廠商 */}
            <div>
              <label className="block text-sm font-medium mb-1">廠商</label>
              <input name="manufacturer" list="manufacturer-list" value={formData.manufacturer} onChange={handleInputChange} className="w-full border p-2 rounded" />
              <datalist id="manufacturer-list">{uniqueManufacturers.map(m => <option key={m} value={m} />)}</datalist>
            </div>

            {/* 店舖 */}
            <div>
              <label className="block text-sm font-medium mb-1">訂購店舖</label>
              <input name="shop" list="shop-list" value={formData.shop} onChange={handleInputChange} className="w-full border p-2 rounded" />
              <datalist id="shop-list">{uniqueShops.map(s => <option key={s} value={s} />)}</datalist>
            </div>

            {/* 預計出貨日期 */}
            <div>
              <label className="block text-sm font-medium mb-1">預計出貨日期 (年月 / 年)</label>
              <input name="expectedDate" value={formData.expectedDate} onChange={handleInputChange} className="w-full border p-2 rounded" placeholder="例如: 2026-10, 2026, 或留空為未知" />
            </div>

            {/* 訂金形式與尾款 */}
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label className="block text-sm font-medium mb-1">訂金形式</label>
                <select name="depositType" value={formData.depositType} onChange={handleInputChange} className="w-full border p-2 rounded bg-white">
                  <option value="partial">部份訂金</option>
                  <option value="full">全款</option>
                </select>
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium mb-1">尾款金額</label>
                <input 
                  type="number" 
                  name="balance" 
                  value={formData.balance} 
                  onChange={handleInputChange} 
                  disabled={formData.depositType === 'full'}
                  className={`w-full border p-2 rounded ${formData.depositType === 'full' ? 'bg-gray-100' : ''}`} 
                />
              </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
            {editingId ? '更新資料' : '儲存至預訂清單'}
          </button>
        </form>
      )}
    </div>
  );
}
