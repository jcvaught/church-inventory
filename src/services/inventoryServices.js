{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\froman\fcharset0 Times-Roman;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\fs24 \cf0 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 import \{ collection, addDoc, serverTimestamp \} from 'firebase/firestore';\
import \{ db \} from './firebase'; // Adjust this path based on your folder structure\
\
/**\
 * Adds a new inventory item and creates an initial activity log entry.\
 * * @param \{Object\} itemData - The form data (name, type, locationId, ministryId, tags, etc.)\
 * @param \{String\} userId - The ID of the admin/user creating the item\
 */\
export async function createNewItem(itemData, userId) \{\
  try \{\
    // 1. Create the Item Document\
    const itemRef = await addDoc(collection(db, 'items'), \{\
      name: itemData.name,\
      type: itemData.type, // 'Equipment' or 'Supply'\
      locationId: itemData.locationId,\
      ministryId: itemData.ministryId,\
      tags: itemData.tags || [],\
      quantity: itemData.quantity || 1,\
      status: 'Available', // Default starting status\
      currentAssignee: null,\
      createdAt: serverTimestamp(),\
      createdBy: userId\
    \});\
\
    // 2. Automatically Stamp the Activity Log\
    await addDoc(collection(db, 'activity_logs'), \{\
      itemId: itemRef.id,\
      userId: userId,\
      action: 'Item Added',\
      timestamp: serverTimestamp(),\
      details: `Added new $\{itemData.type\}: $\{itemData.name\}`\
    \});\
\
    return itemRef.id; // Returns the new unique Item ID\
    \
  \} catch (error) \{\
    console.error("Error adding document and log: ", error);\
    throw error;\
  \}\
\}}