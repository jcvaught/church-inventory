// Initial inventory data from Nancy's spreadsheet
// This is used to populate the database on first run.

export const SEED_ELECTRONICS = [
  { id:"CE-001",cat:"Audio/Visual",desc:"Wireless Microphone System",brand:"Shure",model:"QLXD24/SM58",cond:"Good",ministry:"Worship",loc:"Sanctuary",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-002",cat:"Audio/Visual",desc:"Digital Mixing Console",brand:"Yamaha",model:"TF3",cond:"Good",ministry:"Worship",loc:"Sound Booth",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-003",cat:"Audio/Visual",desc:"Projector",brand:"Epson",model:"PowerLite 2255U",cond:"Good",ministry:"Worship",loc:"Sanctuary",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-004",cat:"Audio/Visual",desc:"Video Camera",brand:"Sony",model:"PXW-Z90V",cond:"Good",ministry:"Media",loc:"Media Room",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-005",cat:"Audio/Visual",desc:"Stage Monitor Speaker",brand:"QSC",model:"K12.2",cond:"Good",ministry:"Worship",loc:"Sanctuary",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-006",cat:"Computers",desc:"Laptop Computer",brand:"Apple",model:"MacBook Pro 14\"",cond:"Good",ministry:"Administration",loc:"Church Office",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-007",cat:"Computers",desc:"Desktop Computer",brand:"Dell",model:"OptiPlex 7090",cond:"Good",ministry:"Administration",loc:"Church Office",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-008",cat:"Computers",desc:"Tablet",brand:"Apple",model:"iPad Pro 12.9\"",cond:"Good",ministry:"Children's Ministry",loc:"Children's Wing",status:"Checked Out",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-009",cat:"Computers",desc:"Laptop Computer",brand:"Microsoft",model:"Surface Pro 9",cond:"Fair",ministry:"Youth Ministry",loc:"Youth Room",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-010",cat:"Lighting",desc:"Stage Lighting Controller",brand:"Chauvet",model:"Iluminarc",cond:"Good",ministry:"Worship",loc:"Sanctuary",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-011",cat:"Lighting",desc:"LED Stage Light (Par)",brand:"Chauvet",model:"SlimPAR Pro H USB",cond:"Good",ministry:"Worship",loc:"Sanctuary",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-012",cat:"Communication",desc:"Two-Way Radio",brand:"Motorola",model:"CLP1080e",cond:"Good",ministry:"Security",loc:"Security Office",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-013",cat:"Communication",desc:"Two-Way Radio",brand:"Motorola",model:"CLP1080e",cond:"Good",ministry:"Security",loc:"Security Office",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-014",cat:"Streaming",desc:"Live Stream Encoder",brand:"Blackmagic",model:"Web Presenter HD",cond:"Good",ministry:"Media",loc:"Media Room",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CE-015",cat:"Display",desc:"Large Format TV (75\")",brand:"Samsung",model:"QN75Q80C",cond:"Good",ministry:"Children's Ministry",loc:"Children's Wing",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
];

export const SEED_TOOLS = [
  { id:"CT-001",cat:"Power Tools",desc:"Cordless Drill / Driver",brand:"DeWalt",model:"DCD791D2",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-002",cat:"Power Tools",desc:"Circular Saw",brand:"Milwaukee",model:"2730-20",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-003",cat:"Power Tools",desc:"Jigsaw",brand:"Bosch",model:"JS572EBL",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-004",cat:"Power Tools",desc:"Orbital Sander",brand:"DeWalt",model:"DWE6423K",cond:"Fair",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-005",cat:"Power Tools",desc:"Reciprocating Saw",brand:"Milwaukee",model:"2621-21",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-006",cat:"Hand Tools",desc:"Tool Set (40-piece)",brand:"Stanley",model:"STMT73795",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"In Use",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-007",cat:"Hand Tools",desc:"Hammer Drill",brand:"DeWalt",model:"DWD112",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-008",cat:"Ladders",desc:"8 ft Step Ladder",brand:"Werner",model:"D6208-2",cond:"Good",ministry:"Facilities",loc:"Storage Room A",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-009",cat:"Ladders",desc:"12 ft Extension Ladder",brand:"Werner",model:"D1112-2",cond:"Good",ministry:"Facilities",loc:"Storage Room A",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-010",cat:"Outdoor",desc:"Lawn Mower (Self-Propelled)",brand:"Honda",model:"HRX217VKA",cond:"Good",ministry:"Grounds",loc:"Outdoor Shed",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-011",cat:"Outdoor",desc:"String Trimmer",brand:"Echo",model:"SRM-225",cond:"Good",ministry:"Grounds",loc:"Outdoor Shed",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-012",cat:"Outdoor",desc:"Leaf Blower",brand:"Husqvarna",model:"350BT",cond:"Good",ministry:"Grounds",loc:"Outdoor Shed",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-013",cat:"Plumbing",desc:"Pipe Wrench Set",brand:"Ridgid",model:"31010",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-014",cat:"Electrical",desc:"Voltage Tester / Multimeter",brand:"Fluke",model:"117",cond:"Good",ministry:"Facilities",loc:"Maintenance Closet",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
  { id:"CT-015",cat:"Painting",desc:"Paint Sprayer",brand:"Graco",model:"Magnum X5",cond:"Fair",ministry:"Facilities",loc:"Storage Room B",status:"Available",assignedTo:"",coDate:"",retDate:"",notes:"" },
];

export const SEED_CONSUMABLES = [
  { id:"CS-001",desc:"AA Batteries (pack of 48)",cat:"Batteries",qty:96,minQty:48,loc:"Supply Closet",ministry:"Worship",lastRestocked:"" },
  { id:"CS-002",desc:"Gaffer Tape (black, 2in)",cat:"Tape",qty:6,minQty:3,loc:"Sound Booth",ministry:"Worship",lastRestocked:"" },
  { id:"CS-003",desc:"Printer Paper (case)",cat:"Office Supplies",qty:4,minQty:2,loc:"Church Office",ministry:"Administration",lastRestocked:"" },
  { id:"CS-004",desc:"Communion Cups (box of 1000)",cat:"Worship Supplies",qty:3,minQty:2,loc:"Kitchen",ministry:"Worship",lastRestocked:"" },
  { id:"CS-005",desc:"Hand Sanitizer (gallon)",cat:"Cleaning",qty:5,minQty:2,loc:"Supply Closet",ministry:"Facilities",lastRestocked:"" },
  { id:"CS-006",desc:"Whiteboard Markers (12-pk)",cat:"Office Supplies",qty:8,minQty:4,loc:"Supply Closet",ministry:"Children's Ministry",lastRestocked:"" },
  { id:"CS-007",desc:"Copy Toner Cartridge",cat:"Office Supplies",qty:2,minQty:2,loc:"Church Office",ministry:"Administration",lastRestocked:"" },
  { id:"CS-008",desc:"Trash Bags (box of 100)",cat:"Cleaning",qty:3,minQty:2,loc:"Janitorial Closet",ministry:"Facilities",lastRestocked:"" },
];

export const SEED_USERS = ["John","Nancy","Pastor Mike","Deacon Harris","Maria","Youth Pastor Alex"];
