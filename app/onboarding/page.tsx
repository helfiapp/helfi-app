import React, { useState } from 'react';

const steps = [
  'gender',
  'physical',
  'healthGoals',
  'supplements',
  'medications',
  'aiInsights',
  'review',
];

function GenderStep({ onNext, initial }: { onNext: (data: any) => void, initial?: string }) {
  const [gender, setGender] = useState(initial || '');
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Let's get started. What's your gender?</h2>
      <p className="mb-4 text-gray-600">This helps tailor your health guidance.</p>
      <div className="flex gap-4 mb-6">
        <button
          className={`flex-1 p-4 rounded border ${gender === 'male' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`}
          onClick={() => setGender('male')}
        >
          Male
        </button>
        <button
          className={`flex-1 p-4 rounded border ${gender === 'female' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`}
          onClick={() => setGender('female')}
        >
          Female
        </button>
      </div>
      <button
        className="btn-primary w-full"
        disabled={!gender}
        onClick={() => gender && onNext({ gender })}
      >
        Continue
      </button>
    </div>
  );
}

function PhysicalStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [weight, setWeight] = useState(initial?.weight || '');
  const [height, setHeight] = useState(initial?.height || '');
  const [bodyType, setBodyType] = useState(initial?.bodyType || '');
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Enter your current weight</h2>
      <p className="mb-4 text-gray-600">Used to personalize health and supplement recommendations.</p>
      <div className="flex justify-end mb-2">
        <button className={`px-3 py-1 rounded-l ${unit === 'metric' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} onClick={() => setUnit('metric')}>kg/cm</button>
        <button className={`px-3 py-1 rounded-r ${unit === 'imperial' ? 'bg-helfi-green text-white' : 'bg-gray-100'}`} onClick={() => setUnit('imperial')}>lbs/in</button>
      </div>
      <input
        className="input-primary mb-4"
        type="number"
        placeholder={`Weight (${unit === 'metric' ? 'kg' : 'lbs'})`}
        value={weight}
        onChange={e => setWeight(e.target.value)}
      />
      <h2 className="text-2xl font-bold mb-4">How tall are you?</h2>
      <p className="mb-4 text-gray-600">Height helps us calculate key health metrics.</p>
      <input
        className="input-primary mb-4"
        type="number"
        placeholder={`Height (${unit === 'metric' ? 'cm' : 'inches'})`}
        value={height}
        onChange={e => setHeight(e.target.value)}
      />
      <h2 className="text-2xl font-bold mb-4">Choose your body type (optional)</h2>
      <p className="mb-4 text-gray-600">Helps tailor insights to your body composition.</p>
      <div className="flex gap-2 mb-6">
        {['ectomorph', 'mesomorph', 'endomorph'].map(type => (
          <button
            key={type}
            className={`flex-1 p-2 rounded border ${bodyType === type ? 'bg-helfi-green text-white' : 'border-helfi-green'}`}
            onClick={() => setBodyType(type)}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
        <button className="flex-1 p-2 rounded border border-gray-300" onClick={() => setBodyType('')}>Skip</button>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" disabled={!weight || !height} onClick={() => onNext({ weight, height, bodyType })}>Next</button>
      </div>
    </div>
  );
}

function HealthGoalsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const defaultGoals = [
    'Energy', 'Libido', 'Sleep Quality', 'Stress', 'Digestion', 'Skin Conditions', 'Mood', 'Bloating', 'Headaches', 'Bowel Movements', 'Erection Quality'
  ];
  const [goals, setGoals] = useState(initial?.goals || []);
  const [customGoal, setCustomGoal] = useState('');
  const toggleGoal = (goal: string) => {
    setGoals((prev: string[]) => prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]);
  };
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Which health concerns are you most interested in improving?</h2>
      <p className="mb-4 text-gray-600">You can choose from our list or add your own.</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {defaultGoals.map(goal => (
          <button
            key={goal}
            className={`p-2 rounded border text-left ${goals.includes(goal) ? 'bg-helfi-green text-white' : 'border-helfi-green'}`}
            onClick={() => toggleGoal(goal)}
          >
            {goal}
          </button>
        ))}
      </div>
      <div className="flex mb-4">
        <input
          className="input-primary flex-1"
          type="text"
          placeholder="Add custom issue"
          value={customGoal}
          onChange={e => setCustomGoal(e.target.value)}
        />
        <button className="btn-primary ml-2" onClick={() => { if (customGoal) { toggleGoal(customGoal); setCustomGoal(''); } }}>Add</button>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" disabled={goals.length === 0} onClick={() => onNext({ goals })}>Next</button>
      </div>
    </div>
  );
}

function SupplementsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [supplements, setSupplements] = useState(initial?.supplements || []);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [timing, setTiming] = useState('');
  const addSupplement = () => {
    if (name && dosage && timing) {
      setSupplements((prev: any[]) => [...prev, { name, dosage, timing }]);
      setName(''); setDosage(''); setTiming('');
    }
  };
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Upload your supplements</h2>
      <p className="mb-4 text-gray-600">Add photos or enter manually to get AI guidance.</p>
      <div className="mb-4">
        <input className="input-primary mb-2" type="text" placeholder="Supplement name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input-primary mb-2" type="text" placeholder="Dosage" value={dosage} onChange={e => setDosage(e.target.value)} />
        <input className="input-primary mb-2" type="text" placeholder="Timing (e.g. morning)" value={timing} onChange={e => setTiming(e.target.value)} />
        <button className="btn-primary w-full" onClick={addSupplement}>Add Supplement</button>
      </div>
      <ul className="mb-4">
        {supplements.map((s: any, i: number) => (
          <li key={i} className="mb-1">{s.name} - {s.dosage} - {s.timing}</li>
        ))}
      </ul>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={() => onNext({ supplements })}>Next</button>
      </div>
    </div>
  );
}

function MedicationsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [medications, setMedications] = useState(initial?.medications || []);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [timing, setTiming] = useState('');
  const addMedication = () => {
    if (name && dosage && timing) {
      setMedications((prev: any[]) => [...prev, { name, dosage, timing }]);
      setName(''); setDosage(''); setTiming('');
    }
  };
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Add your medications</h2>
      <p className="mb-4 text-gray-600">This helps us check for supplement-medication conflicts.</p>
      <div className="mb-4">
        <input className="input-primary mb-2" type="text" placeholder="Medication name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input-primary mb-2" type="text" placeholder="Dosage" value={dosage} onChange={e => setDosage(e.target.value)} />
        <input className="input-primary mb-2" type="text" placeholder="Timing (e.g. night)" value={timing} onChange={e => setTiming(e.target.value)} />
        <button className="btn-primary w-full" onClick={addMedication}>Add Medication</button>
      </div>
      <ul className="mb-4">
        {medications.map((m: any, i: number) => (
          <li key={i} className="mb-1">{m.name} - {m.dosage} - {m.timing}</li>
        ))}
      </ul>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={() => onNext({ medications })}>Analyze for Contradictions</button>
      </div>
    </div>
  );
}

function AIInsightsStep({ onNext, onBack, initial }: { onNext: (data: any) => void, onBack: () => void, initial?: any }) {
  const [wantInsights, setWantInsights] = useState(initial?.wantInsights || '');
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Want AI-generated insights in 7 days?</h2>
      <p className="mb-4 text-gray-600">Our AI will analyze trends and send a custom health report.</p>
      <div className="flex gap-4 mb-6">
        <button className={`flex-1 p-4 rounded border ${wantInsights === 'yes' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`} onClick={() => setWantInsights('yes')}>Yes</button>
        <button className={`flex-1 p-4 rounded border ${wantInsights === 'no' ? 'bg-helfi-green text-white' : 'border-helfi-green'}`} onClick={() => setWantInsights('no')}>No Thanks</button>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" disabled={!wantInsights} onClick={() => onNext({ wantInsights })}>Next</button>
      </div>
    </div>
  );
}

function ReviewStep({ onBack, data }: { onBack: () => void, data: any }) {
  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Here's what we have so far</h2>
      <p className="mb-4 text-gray-600">Double-check your inputs before we take you to your dashboard.</p>
      <div className="mb-4 text-left">
        <div><b>Gender:</b> {data.gender}</div>
        <div><b>Weight:</b> {data.weight}</div>
        <div><b>Height:</b> {data.height}</div>
        <div><b>Body Type:</b> {data.bodyType}</div>
        <div><b>Health Goals:</b> {(data.goals || []).join(', ')}</div>
        <div><b>Supplements:</b> {(data.supplements || []).map((s: any) => `${s.name} (${s.dosage}, ${s.timing})`).join('; ')}</div>
        <div><b>Medications:</b> {(data.medications || []).map((m: any) => `${m.name} (${m.dosage}, ${m.timing})`).join('; ')}</div>
        <div><b>AI Insights:</b> {data.wantInsights === 'yes' ? 'Yes' : 'No'}</div>
      </div>
      <div className="flex justify-between">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={() => window.location.href = '/dashboard'}>Confirm &amp; Begin</button>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<any>({});

  const handleNext = (data: any) => {
    setForm((prev: any) => ({ ...prev, ...data }));
    setStep((prev) => prev + 1);
  };
  const handleBack = () => setStep((prev) => Math.max(0, prev - 1));

  if (steps[step] === 'gender') {
    return <GenderStep onNext={handleNext} initial={form.gender} />;
  }
  if (steps[step] === 'physical') {
    return <PhysicalStep onNext={handleNext} onBack={handleBack} initial={form} />;
  }
  if (steps[step] === 'healthGoals') {
    return <HealthGoalsStep onNext={handleNext} onBack={handleBack} initial={form} />;
  }
  if (steps[step] === 'supplements') {
    return <SupplementsStep onNext={handleNext} onBack={handleBack} initial={form} />;
  }
  if (steps[step] === 'medications') {
    return <MedicationsStep onNext={handleNext} onBack={handleBack} initial={form} />;
  }
  if (steps[step] === 'aiInsights') {
    return <AIInsightsStep onNext={handleNext} onBack={handleBack} initial={form} />;
  }
  if (steps[step] === 'review') {
    return <ReviewStep onBack={handleBack} data={form} />;
  }
  return null;
}