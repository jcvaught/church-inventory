import { useState } from 'react';
import { createNewItem } from '../services/inventoryServices'; // Adjust this path if needed
import { auth } from '../firebase'; // Adjust this path to your firebase.js file

export default function ItemForm() {
  const [formData, setFormData] = useState({
    name: '',
    type: 'Equipment', // Defaults to Equipment
    locationId: '',
    ministryId: '',
    quantity: 1
  });
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Saving...');
    
    try {
      // Gets the currently logged-in user's ID
      const userId = auth.currentUser ? auth.currentUser.uid : 'admin-user';
      
      // Calls the function we built in the last step
      await createNewItem(formData, userId);
      
      setMessage('Item successfully added to inventory!');
      
      // Resets the form to empty after a successful save
      setFormData({ name: '', type: 'Equipment', locationId: '', ministryId: '', quantity: 1 });
    } catch (error) {
      console.error("Error adding item:", error);
      setMessage('Error saving item. Please try again.');
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-lg shadow-md mt-10">
      <h2 className="text-2xl font-bold mb-6">Add New Inventory Item</h2>
      
      {message && <p className="mb-4 text-blue-600 font-semibold">{message}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Item Name</label>
          <input 
            type="text" 
            name="name" 
            value={formData.name} 
            onChange={handleChange} 
            required 
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
            placeholder="e.g., Wireless Mic A"
          />
        </div>

        {/* Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select 
            name="type" 
            value={formData.type} 
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
          >
            <option value="Equipment">Equipment (Check-out/Return)</option>
            <option value="Supply">Supply (Consumable)</option>
          </select>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded hover:bg-blue-700"
        >
          Save Item
        </button>
      </form>
    </div>
  );
}