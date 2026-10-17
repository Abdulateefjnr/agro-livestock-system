// Fictional demonstration records. Dates are relative to the first seed run.
module.exports = (now = new Date()) => ({
  farms: [
    { key: 'keffi', name: 'Demo — Keffi Mixed Farm', location: 'Keffi, Nasarawa', sizeHectares: 40, farmType: 'Mixed', owner: 'Demo Farm Cooperative', cropAreaHectares: 25, livestockAreaHectares: 10, otherAreaHectares: 5, status: 'active' },
    { key: 'lafia', name: 'Demo — Lafia Crop Farm', location: 'Lafia, Nasarawa', sizeHectares: 60, farmType: 'Crop', owner: 'Demo Farm Cooperative', cropAreaHectares: 50, livestockAreaHectares: 0, otherAreaHectares: 10, status: 'active' },
    { key: 'abuja', name: 'Demo — Abuja Livestock Farm', location: 'Abuja, FCT', sizeHectares: 20, farmType: 'Livestock', owner: 'Demo Farm Cooperative', cropAreaHectares: 0, livestockAreaHectares: 16, otherAreaHectares: 4, status: 'maintenance' }
  ],
  livestock: [
    ...Array.from({ length: 6 }, (_, i) => ({ farm: 'keffi', name: `Demo dairy cow ${i + 1}`, species: 'Cattle', tagId: `DEMO-C${String(i + 1).padStart(3, '0')}` })),
    ...Array.from({ length: 4 }, (_, i) => ({ farm: 'abuja', name: `Demo goat ${i + 1}`, species: 'Goat', tagId: `DEMO-G${String(i + 1).padStart(3, '0')}` })),
    { farm: 'keffi', name: 'Demo ram', species: 'Sheep', tagId: 'DEMO-S001' },
    { farm: 'abuja', name: 'Demo untagged calf', species: 'Cattle', tagId: '' }
  ],
  crops: [
    { farm: 'keffi', name: 'Demo maize field', status: 'active', plantedHectares: 12 },
    { farm: 'keffi', name: 'Demo vegetable garden', status: 'active', plantedHectares: 5 },
    { farm: 'keffi', name: 'Demo fallow field', status: 'inactive', plantedHectares: 8 },
    { farm: 'lafia', name: 'Demo rice field', status: 'active', plantedHectares: 20 },
    { farm: 'lafia', name: 'Demo cassava field', status: 'active', plantedHectares: 18 },
    { farm: 'lafia', name: 'Demo soybean field', status: 'active', plantedHectares: 12 }
  ],
  inventory: [
    { farm: 'keffi', name: 'Demo cattle feed', category: 'Feed', quantity: 850, unit: 'kg', reorderLevel: 200 },
    { farm: 'keffi', name: 'Demo maize seed', category: 'Seeds', quantity: 120, unit: 'kg', reorderLevel: 30 },
    { farm: 'keffi', name: 'Demo mineral supplement', category: 'Feed', quantity: 8, unit: 'bags', reorderLevel: 10 },
    { farm: 'lafia', name: 'Demo rice seed', category: 'Seeds', quantity: 250, unit: 'kg', reorderLevel: 50 },
    { farm: 'lafia', name: 'Demo fertilizer', category: 'Fertilizer', quantity: 35, unit: 'bags', reorderLevel: 10 },
    { farm: 'lafia', name: 'Demo hand tools', category: 'Equipment', quantity: 18, unit: 'pieces', reorderLevel: 5 },
    { farm: 'abuja', name: 'Demo animal feed', category: 'Feed', quantity: 400, unit: 'kg', reorderLevel: 100 },
    { farm: 'abuja', name: 'Demo veterinary supplies', category: 'Medicine', quantity: 0, unit: 'packs', reorderLevel: 0 }
  ],
  transactions: Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1))
    return {
      date,
      sales: [
        { farm: 'keffi', description: 'Demo milk sales', amount: 180000 + index * 15000 },
        { farm: 'lafia', description: 'Demo crop sales', amount: 300000 + index * 25000 },
        { farm: 'abuja', description: 'Demo livestock sales', amount: 140000 + index * 10000 }
      ],
      expenses: [
        { farm: 'keffi', description: 'Demo feed and wages', amount: 95000 + index * 5000 },
        { farm: 'lafia', description: 'Demo seeds and field work', amount: 155000 + index * 8000 },
        { farm: 'abuja', description: 'Demo animal care', amount: 70000 + index * 4000 }
      ]
    }
  }),
  routines: [
    { farm: 'keffi', title: 'Demo morning feeding', type: 'Feeding', dayOffset: 0, repeat: 'Daily', completed: false },
    { farm: 'keffi', title: 'Demo herd vaccination', type: 'Vaccination', dayOffset: 3, repeat: 'Monthly', completed: false },
    { farm: 'lafia', title: 'Demo irrigation check', type: 'Irrigation', dayOffset: 1, repeat: 'Weekly', completed: false },
    { farm: 'lafia', title: 'Demo harvest inspection', type: 'Harvesting', dayOffset: 6, repeat: 'Does not repeat', completed: false },
    { farm: 'abuja', title: 'Demo overdue health check', type: 'Other', dayOffset: -2, repeat: 'Does not repeat', completed: false },
    { farm: 'abuja', title: 'Demo completed feeding', type: 'Feeding', dayOffset: -1, repeat: 'Does not repeat', completed: true }
  ]
})
