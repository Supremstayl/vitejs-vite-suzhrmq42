import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase Konfiguration mit direktem Fallback
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://vftpkzventrmmtlajl.supabase.co';
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_JoQD_pjVmON8QDWm1tX5iA_47vtX0Qg';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function FahrzeugscheinScanner() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [appPin, setAppPin] = useState(() => {
    return localStorage.getItem('app_pin') || 'gGdHaC';
  });
  const [pinInput, setPinInput] = useState('');

  const [apiKey, setApiKey] = useState(() => {
    return (
      localStorage.getItem('gemini_custom_api_key') ||
      'AQ.Ab8RN6KOnTDlIWUTg8lAPaiPHQElO5n-i4fKqoU3FummtTL9yw'
    );
  });

  const [scans, setScans] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [isManualOpen, setIsManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    kennzeichen: '',
    name: '',
    hersteller: '',
    modell: '',
    motorcode: '',
    kw: '',
    hubraum: '',
    hsn_tsn: '',
    baujahr: '',
    vin: '',
    schadstoffklasse: '',
    emissionsnummer: '',
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [tempPin, setTempPin] = useState(appPin);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState({
    kategorie: 'Reparatur',
    datum: new Date().toISOString().split('T')[0],
    beschreibung: '',
    teilenummern: '',
  });

  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [docForm, setDocForm] = useState({
    kategorie: 'Rechnungen',
    titel: '',
    datum: new Date().toISOString().split('T')[0],
    dateiData: '',
    isPdf: false,
  });

  const [duplicateModal, setDuplicateModal] = useState({
    isOpen: false,
    existingVehicle: null,
    newScanData: null,
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Daten beim Start aus Supabase laden
  useEffect(() => {
    fetchVehiclesFromCloud();
  }, []);

  const fetchVehiclesFromCloud = async () => {
    try {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (error) throw error;
      if (data) {
        const loadedScans = data.map((item) => ({
          supabaseId: item.id,
          ...item.data,
          bilder: item.data.bilder || (item.data.bild ? [item.data.bild] : []),
          historie: item.data.historie || [],
          dokumente: item.data.dokumente || [],
        }));
        setScans(loadedScans);
      }
    } catch (err) {
      console.warn('Cloud-Laden übersprungen / lokal aktiv:', err.message);
    }
  };

  // Fahrzeug in Supabase speichern (mit Fallback auf lokalen State bei CORS/Netzwerkfehlern)
  const saveVehicleToCloud = async (vehicleData) => {
    try {
      if (vehicleData.supabaseId) {
        const { error } = await supabase
          .from('vehicles')
          .update({ data: vehicleData })
          .eq('id', vehicleData.supabaseId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('vehicles')
          .insert([{ data: vehicleData }])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          vehicleData.supabaseId = data[0].id;
        }
      }
    } catch (err) {
      console.warn(
        'Cloud-Speichern fehlgeschlagen (Sandbox/CORS), lokal aktiv:',
        err.message
      );
    }
  };

  // Fahrzeug aus Supabase löschen
  const deleteVehicleFromCloud = async (supabaseId) => {
    if (!supabaseId) return;
    try {
      await supabase.from('vehicles').delete().eq('id', supabaseId);
    } catch (err) {
      console.error('Fehler beim Löschen in der Cloud:', err.message);
    }
  };

  const handleSaveSettings = () => {
    if (!tempApiKey.trim()) {
      alert('Bitte gib einen gültigen API-Schlüssel ein.');
      return;
    }
    if (!tempPin.trim()) {
      alert('Bitte gib eine gültige PIN ein.');
      return;
    }
    setApiKey(tempApiKey.trim());
    setAppPin(tempPin.trim());
    localStorage.setItem('gemini_custom_api_key', tempApiKey.trim());
    localStorage.setItem('app_pin', tempPin.trim());
    setIsSettingsOpen(false);
    alert('Einstellungen erfolgreich gespeichert!');
  };

  const startCamera = async () => {
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Fehler beim Kamerazugriff: ' + err.message);
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
    }
    setIsScanning(false);
  };

  const captureImage = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    stopCamera();

    if (selectedVehicle) {
      addPageToVehicle(imageBase64);
    } else {
      extractDataWithAI(imageBase64);
    }
  };

  const handleFileUpload = (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file, index) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (index === 0 && !selectedVehicle) {
            extractDataWithAI(reader.result);
          } else if (selectedVehicle) {
            addPageToVehicle(reader.result);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const addPageToVehicle = async (imageBase64) => {
    const updatedBilder = [...(selectedVehicle.bilder || []), imageBase64];
    const updatedVehicle = { ...selectedVehicle, bilder: updatedBilder };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);
  };

  const cancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  };

  const processNewVehicleData = async (newScanData) => {
    const existing = scans.find(
      (s) =>
        s.kennzeichen.toLowerCase() === newScanData.kennzeichen.toLowerCase() &&
        newScanData.kennzeichen !== 'Unbekannt' &&
        newScanData.kennzeichen !== ''
    );

    if (existing) {
      setDuplicateModal({
        isOpen: true,
        existingVehicle: existing,
        newScanData: newScanData,
      });
    } else {
      await saveVehicleToCloud(newScanData);
      setScans((prevScans) => [newScanData, ...prevScans]);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualForm.kennzeichen.trim()) {
      alert('Bitte gib mindestens ein Kennzeichen ein.');
      return;
    }

    const newVehicle = {
      id: Date.now(),
      kennzeichen: manualForm.kennzeichen || 'Unbekannt',
      name: manualForm.name || 'Unbekannt',
      hersteller: manualForm.hersteller || 'Unbekannt',
      modell: manualForm.modell || 'Unbekannt',
      baujahr: manualForm.baujahr || 'Nicht lesbar',
      hsn_tsn: manualForm.hsn_tsn || 'Nicht lesbar',
      vin: manualForm.vin || 'Nicht lesbar',
      schadstoffklasse: manualForm.schadstoffklasse || 'Nicht lesbar',
      emissionsnummer: manualForm.emissionsnummer || 'Nicht lesbar',
      hubraum: manualForm.hubraum || 'Nicht lesbar',
      kw: manualForm.kw || 'Nicht lesbar',
      motorcode: manualForm.motorcode || 'Nicht eingetragen',
      bilder: [],
      historie: [],
      dokumente: [],
      datum: new Date().toLocaleDateString('de-DE'),
    };

    await processNewVehicleData(newVehicle);
    setIsManualOpen(false);
    setManualForm({
      kennzeichen: '',
      name: '',
      hersteller: '',
      modell: '',
      motorcode: '',
      kw: '',
      hubraum: '',
      hsn_tsn: '',
      baujahr: '',
      vin: '',
      schadstoffklasse: '',
      emissionsnummer: '',
    });
  };

  const extractDataWithAI = async (imageBase64) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    const base64Data = imageBase64.split(',')[1];

    const prompt = `Du bist ein Experte für Fahrzeugdokumente. Analysiere diesen deutschen Fahrzeugschein (Zulassungsbescheinigung Teil I oder alter Fahrzeugschein).
    Extrahiere die folgenden Daten und gib sie AUSSCHLIESSLICH als valides JSON-Objekt zurück. Keine Erklärungen, kein Markdown drumherum.
    Nutze exakt diese JSON-Keys:
    - kennzeichen (Amtliches Kennzeichen, formatiert als XX-XX 0000)
    - name (Name des Halters)
    - hersteller (Fahrzeughersteller, D.1 oder Feld 2)
    - modell (Fahrzeugmodell, D.3 oder Feld 3)
    - baujahr (Datum der Erstzulassung, Feld B oder Feld 32)
    - hsn_tsn (Die HSN und TSN zusammen, Feld 2.1 und 2.2, zum Beispiel null-null-null-fuenf/ABC)
    - vin (Fahrgestellnummer, Feld E oder Feld 4)
    - schadstoffklasse (Feld 14 oder Feld 1)
    - emissionsnummer (Feld 14.1 oder die letzten 2 Ziffern von Feld 1)
    - hubraum (Feld P.1 oder Feld 8, Wert in ccm)
    - kw (Feld P.2 oder Feld 7, exakter Wert in kW, ohne PS, z.B. 129 kW)
    Falls ein Wert nicht auf dem Bild erkennbar ist, schreibe "Nicht lesbar".`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: { mime_type: 'image/jpeg', data: base64Data },
                  },
                ],
              },
            ],
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error.message);
      }

      let textResponse = result.candidates[0].content.parts[0].text;
      textResponse = textResponse
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const aiData = JSON.parse(textResponse);

      const newScanData = {
        id: Date.now(),
        kennzeichen: aiData.kennzeichen || 'Unbekannt',
        name: aiData.name || 'Unbekannt',
        hersteller: aiData.hersteller || 'Unbekannt',
        modell: aiData.modell || 'Unbekannt',
        baujahr: aiData.baujahr || 'Unbekannt',
        hsn_tsn: aiData.hsn_tsn || 'Unbekannt',
        vin: aiData.vin || 'Unbekannt',
        schadstoffklasse: aiData.schadstoffklasse || 'Unbekannt',
        emissionsnummer: aiData.emissionsnummer || 'Unbekannt',
        hubraum: aiData.hubraum || 'Unbekannt',
        kw: aiData.kw || 'Unbekannt',
        motorcode: 'Nicht eingetragen',
        bilder: [imageBase64],
        historie: [],
        dokumente: [],
        datum: new Date().toLocaleDateString('de-DE'),
      };

      await processNewVehicleData(newScanData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        alert('Fehler bei der KI-Analyse: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateAction = async (action) => {
    const { existingVehicle, newScanData } = duplicateModal;

    if (action === 'new') {
      await saveVehicleToCloud(newScanData);
      setScans((prev) => [newScanData, ...prev]);
    } else if (action === 'merge') {
      const updatedBilder = [
        ...(existingVehicle.bilder || []),
        ...(newScanData.bilder || []),
      ];
      const merged = { ...existingVehicle, bilder: updatedBilder };
      await saveVehicleToCloud(merged);
      setScans((prev) =>
        prev.map((s) => (s.id === existingVehicle.id ? merged : s))
      );
      setSelectedVehicle(merged);
    } else if (action === 'overwrite') {
      const overwritten = {
        ...existingVehicle,
        ...newScanData,
        id: existingVehicle.id,
        supabaseId: existingVehicle.supabaseId,
        bilder:
          newScanData.bilder.length > 0
            ? newScanData.bilder
            : existingVehicle.bilder,
        historie: existingVehicle.historie,
        dokumente: existingVehicle.dokumente,
      };
      await saveVehicleToCloud(overwritten);
      setScans((prev) =>
        prev.map((s) => (s.id === existingVehicle.id ? overwritten : s))
      );
      setSelectedVehicle(overwritten);
    }

    setDuplicateModal({
      isOpen: false,
      existingVehicle: null,
      newScanData: null,
    });
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (
      window.confirm(
        '⚠️ Möchtest du diesen Fahrzeugschein wirklich unwiderruflich löschen?'
      )
    ) {
      const scanToDelete = scans.find((s) => s.id === id);
      if (scanToDelete && scanToDelete.supabaseId) {
        await deleteVehicleFromCloud(scanToDelete.supabaseId);
      }
      const updatedScans = scans.filter((scan) => scan.id !== id);
      setScans(updatedScans);
      if (selectedVehicle && selectedVehicle.id === id) {
        setSelectedVehicle(null);
        setIsEditing(false);
      }
    }
  };

  const handleDeletePage = async (e, indexToRemove) => {
    e.stopPropagation();
    if (selectedVehicle.bilder.length <= 1) {
      alert(
        'Ein Fahrzeugschein muss mindestens eine Seite haben. Nutze ansonsten die Gesamtlöschung.'
      );
      return;
    }
    if (window.confirm('Diese Seite wirklich löschen?')) {
      const updatedBilder = selectedVehicle.bilder.filter(
        (_, idx) => idx !== indexToRemove
      );
      const updatedVehicle = { ...selectedVehicle, bilder: updatedBilder };
      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleStartEdit = (e, scan) => {
    e.stopPropagation();
    setSelectedVehicle(scan);
    setEditForm({
      ...scan,
      motorcode: scan.motorcode || 'Nicht eingetragen',
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    const updatedScans = scans.map((scan) =>
      scan.id === editForm.id ? editForm : scan
    );
    setScans(updatedScans);
    setSelectedVehicle(editForm);
    setIsEditing(false);
    await saveVehicleToCloud(editForm);
  };

  const handleAddHistoryEntry = async (e) => {
    e.preventDefault();
    if (!historyForm.beschreibung.trim()) {
      alert('Bitte gib eine Beschreibung der Arbeiten ein.');
      return;
    }

    const newEntry = {
      id: Date.now(),
      ...historyForm,
    };

    const updatedHistorie = [newEntry, ...(selectedVehicle.historie || [])];
    const updatedVehicle = { ...selectedVehicle, historie: updatedHistorie };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);

    setHistoryForm({
      kategorie: 'Reparatur',
      datum: new Date().toISOString().split('T')[0],
      beschreibung: '',
      teilenummern: '',
    });
  };

  const handleDeleteHistoryEntry = async (entryId) => {
    if (window.confirm('Diesen Historien-Eintrag wirklich löschen?')) {
      const updatedHistorie = selectedVehicle.historie.filter(
        (h) => h.id !== entryId
      );
      const updatedVehicle = { ...selectedVehicle, historie: updatedHistorie };

      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleAddDocument = async (e) => {
    e.preventDefault();
    if (!docForm.titel.trim()) {
      alert('Bitte gib einen Titel für das Dokument an.');
      return;
    }

    const newDoc = {
      id: Date.now(),
      ...docForm,
    };

    const updatedDocs = [newDoc, ...(selectedVehicle.dokumente || [])];
    const updatedVehicle = { ...selectedVehicle, dokumente: updatedDocs };

    setSelectedVehicle(updatedVehicle);
    setScans(
      scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
    );
    await saveVehicleToCloud(updatedVehicle);

    setDocForm({
      kategorie: 'Rechnungen',
      titel: '',
      datum: new Date().toISOString().split('T')[0],
      dateiData: '',
      isPdf: false,
    });
  };

  const handleDeleteDocument = async (docId) => {
    if (window.confirm('Dieses Dokument wirklich löschen?')) {
      const updatedDocs = selectedVehicle.dokumente.filter(
        (d) => d.id !== docId
      );
      const updatedVehicle = { ...selectedVehicle, dokumente: updatedDocs };

      setSelectedVehicle(updatedVehicle);
      setScans(
        scans.map((s) => (s.id === updatedVehicle.id ? updatedVehicle : s))
      );
      await saveVehicleToCloud(updatedVehicle);
    }
  };

  const handleDocFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const isPdf =
        file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocForm({
          ...docForm,
          dateiData: reader.result,
          isPdf: isPdf,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const openDocumentInNewTab = (doc) => {
    if (!doc.dateiData) return;

    if (doc.isPdf) {
      const byteCharacters = atob(doc.dateiData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } else {
      const win = window.open();
      win.document.write(
        `<iframe src="${doc.dateiData}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`
      );
    }
  };

  if (!isUnlocked) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-gray-900 text-gray-100 font-sans w-full h-full flex justify-center items-center p-4">
        <div className="max-w-xs w-full bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
          <div className="text-3xl mb-1">🔒</div>
          <h2 className="text-xl font-bold text-white">App gesperrt</h2>
          <p className="text-xs text-gray-400">
            Bitte gib deine PIN ein, um den KFZ-Schein Scanner zu entsperren
            (Standard: 1234).
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pinInput === appPin) {
                setIsUnlocked(true);
                setPinInput('');
              } else {
                alert('Falsche PIN!');
                setPinInput('');
              }
            }}
            className="space-y-3"
          >
            <input
              type="password"
              maxLength="6"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN eingeben"
              className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white text-center font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-xs shadow transition-all"
            >
              Entsperren
            </button>
          </form>
        </div>
      </div>
    );
  }

  const filteredScans = scans.filter(
    (scan) =>
      scan.kennzeichen.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scan.hersteller.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scan.vin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (scan.motorcode &&
        scan.motorcode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-900 text-gray-100 font-sans w-full h-full flex justify-center">
      <div className="max-w-md w-full bg-gray-900 h-full flex flex-col shadow-2xl border-x border-gray-800">
        <header className="bg-gray-800 text-white p-4 shadow-md flex justify-between items-center border-b border-gray-700 sticky top-0 z-10 shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">
              KFZ-Schein Scanner (Cloud)
            </h1>
          </div>
          <button
            onClick={() => {
              setTempApiKey(apiKey);
              setTempPin(appPin);
              setIsSettingsOpen(true);
            }}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl transition-all shadow border border-gray-600 flex items-center justify-center"
            title="Einstellungen & Sicherheit"
          >
            ⚙️
          </button>
        </header>

        <main className="p-4 overflow-y-auto flex-grow pb-16">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-400 relative">
              <button
                onClick={cancelAnalysis}
                className="absolute top-4 right-4 bg-gray-800 hover:bg-red-600 text-gray-300 hover:text-white font-bold w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center shadow-lg transition-all"
                title="Analyse abbrechen"
              >
                ✕
              </button>

              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-400 mb-4"></div>
              <p className="font-bold text-lg mb-2">
                Analysiere den Fahrzeugschein...
              </p>
              <p className="text-xs text-gray-500">
                Tippe auf das X, um abzubrechen
              </p>
            </div>
          ) : selectedVehicle ? (
            <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={() => {
                    setSelectedVehicle(null);
                    setIsEditing(false);
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-bold flex items-center"
                >
                  ← Zurück zur Übersicht
                </button>

                {!isEditing && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsHistoryOpen(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all shadow flex items-center gap-1"
                      title="Werkstatt-Historie öffnen"
                    >
                      📋 Historie ({selectedVehicle.historie?.length || 0})
                    </button>
                    <button
                      onClick={() => setIsDocsOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all shadow flex items-center gap-1"
                      title="Dokumente & Dateien öffnen"
                    >
                      📎 Docs ({selectedVehicle.dokumente?.length || 0})
                    </button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-white mb-2">
                    Fahrzeugdaten bearbeiten
                  </h2>

                  <div>
                    <label className="text-xs text-gray-400">
                      Kennzeichen:
                    </label>
                    <input
                      type="text"
                      value={editForm.kennzeichen || ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          kennzeichen: e.target.value,
                        })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">
                      Kunde / Halter:
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">
                        Hersteller:
                      </label>
                      <input
                        type="text"
                        value={editForm.hersteller || ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            hersteller: e.target.value,
                          })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Modell:</label>
                      <input
                        type="text"
                        value={editForm.modell || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, modell: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">Motorcode:</label>
                    <input
                      type="text"
                      value={editForm.motorcode || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, motorcode: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-blue-500 rounded text-white font-semibold"
                      placeholder="z.B. N20B20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">
                        Leistung (kW):
                      </label>
                      <input
                        type="text"
                        value={editForm.kw || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, kw: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">
                        Hubraum (ccm):
                      </label>
                      <input
                        type="text"
                        value={editForm.hubraum || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, hubraum: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">HSN/TSN:</label>
                      <input
                        type="text"
                        value={editForm.hsn_tsn || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, hsn_tsn: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">
                        Baujahr / EZ:
                      </label>
                      <input
                        type="text"
                        value={editForm.baujahr || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, baujahr: e.target.value })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">
                      Fahrgestellnummer (VIN):
                    </label>
                    <input
                      type="text"
                      value={editForm.vin || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, vin: e.target.value })
                      }
                      className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">
                        Schadstoffklasse:
                      </label>
                      <input
                        type="text"
                        value={editForm.schadstoffklasse || ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            schadstoffklasse: e.target.value,
                          })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">
                        Emissionsnummer:
                      </label>
                      <input
                        type="text"
                        value={editForm.emissionsnummer || ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            emissionsnummer: e.target.value,
                          })
                        }
                        className="w-full p-2 bg-gray-900 border border-gray-700 rounded text-white"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold shadow transition-all"
                    >
                      💾 Speichern
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-bold shadow transition-all"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-3xl font-bold text-white tracking-wide">
                      {selectedVehicle.kennzeichen}
                    </h2>
                    <button
                      onClick={(e) => handleStartEdit(e, selectedVehicle)}
                      className="p-1 bg-gray-700 hover:bg-blue-600 text-gray-200 hover:text-white rounded-md transition-all shadow border border-gray-600 flex items-center justify-center text-xs"
                      title="Fahrzeugdaten bearbeiten"
                    >
                      ✏️
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <span className="text-gray-400 text-sm">Kunde:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.name}</b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Fahrzeug:</span>
                      <br />
                      <b className="text-gray-100">
                        {selectedVehicle.hersteller} {selectedVehicle.modell}
                      </b>
                    </div>
                    <div className="col-span-2 bg-gray-900/50 p-2.5 rounded-lg border border-gray-700">
                      <span className="text-gray-400 text-xs uppercase tracking-wider">
                        Motorcode:
                      </span>
                      <br />
                      <b className="text-blue-400 text-lg">
                        {selectedVehicle.motorcode || 'Nicht eingetragen'}
                      </b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Leistung:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.kw}</b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Hubraum:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.hubraum}</b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">HSN/TSN:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.hsn_tsn}</b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">Baujahr:</span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.baujahr}</b>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400 text-sm">
                        Fahrgestellnummer (VIN):
                      </span>
                      <br />
                      <b className="text-gray-100">{selectedVehicle.vin}</b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">
                        Schadstoffklasse:
                      </span>
                      <br />
                      <b className="text-gray-100">
                        {selectedVehicle.schadstoffklasse}
                      </b>
                    </div>
                    <div>
                      <span className="text-gray-400 text-sm">
                        Emissionsnummer:
                      </span>
                      <br />
                      <b className="text-gray-100">
                        {selectedVehicle.emissionsnummer}
                      </b>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-gray-400 text-sm font-semibold">
                        Gescannte Seiten ({selectedVehicle.bilder?.length || 0}
                        ):
                      </h3>
                    </div>

                    <div className="flex flex-row gap-2 mb-4">
                      <button
                        onClick={startCamera}
                        className="w-1/2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-2 rounded-xl font-bold text-xs shadow flex justify-center items-center gap-1 transition-all"
                      >
                        📷 Kamera Seite
                      </button>

                      <label className="w-1/2 bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white py-2.5 px-2 rounded-xl font-bold text-xs shadow flex justify-center items-center gap-1 cursor-pointer transition-all border border-gray-600 text-center">
                        📁 Datei wählen
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="space-y-3">
                      {selectedVehicle.bilder &&
                        selectedVehicle.bilder.map((imgSrc, idx) => (
                          <div
                            key={idx}
                            className="relative bg-gray-900 p-2 rounded-lg border border-gray-700"
                          >
                            <div className="flex justify-between items-center mb-1 px-1">
                              <span className="text-xs text-gray-400 font-semibold">
                                Seite {idx + 1}
                              </span>
                              <div className="flex gap-2.5 items-center">
                                <button
                                  onClick={() => {
                                    setActiveImageIndex(idx);
                                    setIsModalOpen(true);
                                  }}
                                  className="text-xs text-blue-400 hover:underline"
                                >
                                  🔍 Vergrößern
                                </button>
                                <button
                                  onClick={(e) => handleDeletePage(e, idx)}
                                  className="text-xs text-red-400 hover:underline font-bold"
                                  title="Diese Seite löschen"
                                >
                                  🗑️ Löschen
                                </button>
                              </div>
                            </div>
                            <img
                              src={imgSrc}
                              alt={`Fahrzeugschein Seite ${idx + 1}`}
                              onClick={() => {
                                setActiveImageIndex(idx);
                                setIsModalOpen(true);
                              }}
                              className="w-full rounded border border-gray-600 cursor-pointer hover:border-blue-500 transition-all object-cover max-h-48"
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : isScanning ? (
            <div className="bg-black rounded-xl overflow-hidden relative shadow-lg border border-gray-700">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-96 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={stopCamera}
                  className="bg-red-600 hover:bg-red-700 transition-colors text-white px-5 py-2 rounded-full font-bold shadow-lg"
                >
                  Abbrechen
                </button>
                <button
                  onClick={captureImage}
                  className="bg-white text-blue-600 px-6 py-2 rounded-full font-bold shadow-lg"
                >
                  {selectedVehicle ? 'Seite hinzufügen' : 'Foto auslösen'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-6">
                <button
                  onClick={startCamera}
                  className="bg-blue-600 text-white py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 hover:bg-blue-700 transition-all active:scale-95 text-center"
                >
                  <span>📷</span> Kamera
                </button>

                <label className="bg-gray-800 text-gray-200 py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 cursor-pointer hover:bg-gray-700 hover:text-white transition-all border border-gray-600 active:scale-95 text-center">
                  <span>📁</span> Datei
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() => setIsManualOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white py-3 px-1 rounded-xl font-bold text-xs shadow-lg flex flex-col justify-center items-center gap-1 transition-all active:scale-95 text-center"
                >
                  <span>➕</span> Manuell
                </button>
              </div>

              <div className="mb-6 relative">
                <input
                  type="text"
                  placeholder="🔍 Suchen nach Kennzeichen, Name, Motorcode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-4 pl-12 bg-gray-800 text-white border border-gray-700 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 transition-all"
                />
              </div>

              <div className="space-y-3">
                {filteredScans.map((scan) => (
                  <div
                    key={scan.id}
                    onClick={() => setSelectedVehicle(scan)}
                    className="bg-gray-800 p-4 rounded-xl shadow-md cursor-pointer border-l-4 border-blue-500 hover:bg-gray-700 hover:shadow-lg transition-all flex justify-between items-center"
                  >
                    <div className="flex-grow pr-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-lg text-white">
                          {scan.kennzeichen}
                        </span>
                        <span className="text-xs text-gray-400">
                          {scan.datum}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 flex flex-wrap items-center gap-2">
                        <span className="text-gray-300">
                          {scan.hersteller} {scan.modell}
                        </span>
                        <span>|</span>
                        <span className="text-blue-400 font-medium bg-gray-900/60 px-2 py-0.5 rounded text-xs border border-gray-700">
                          {scan.motorcode || 'Kein Motorcode'}
                        </span>
                        {scan.bilder && scan.bilder.length > 0 && (
                          <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                            📄 {scan.bilder.length} Seiten
                          </span>
                        )}
                        {scan.historie && scan.historie.length > 0 && (
                          <span className="text-xs bg-purple-900/60 text-purple-300 px-1.5 py-0.5 rounded border border-purple-700">
                            📋 {scan.historie.length}
                          </span>
                        )}
                        {scan.dokumente && scan.dokumente.length > 0 && (
                          <span className="text-xs bg-teal-900/60 text-teal-300 px-1.5 py-0.5 rounded border border-teal-700">
                            📎 {scan.dokumente.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => handleStartEdit(e, scan)}
                        title="Bearbeiten"
                        className="p-2 bg-gray-700 hover:bg-blue-600 text-gray-300 hover:text-white rounded-lg transition-colors"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, scan.id)}
                        title="Löschen"
                        className="p-2 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded-lg transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
                {filteredScans.length === 0 && (
                  <p className="text-center text-gray-500 mt-8">
                    Keine Fahrzeuge gefunden.
                  </p>
                )}
              </div>
            </>
          )}
        </main>

        <footer className="bg-gray-900 border-t border-gray-800 text-right p-3 sticky bottom-0 z-10 shrink-0">
          <p className="text-xs text-gray-500">© D.Irmer</p>
        </footer>

        {isManualOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                <h2 className="text-lg font-bold text-white">
                  ➕ Fahrzeug manuell anlegen
                </h2>
                <button
                  onClick={() => setIsManualOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400">
                    Kennzeichen *:
                  </label>
                  <input
                    type="text"
                    required
                    value={manualForm.kennzeichen}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        kennzeichen: e.target.value,
                      })
                    }
                    placeholder="z.B. ES-DI 2026"
                    className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400">
                    Kunde / Halter:
                  </label>
                  <input
                    type="text"
                    value={manualForm.name}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, name: e.target.value })
                    }
                    placeholder="z.B. Daniel Irmer"
                    className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">Hersteller:</label>
                    <input
                      type="text"
                      value={manualForm.hersteller}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          hersteller: e.target.value,
                        })
                      }
                      placeholder="z.B. BMW"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Modell:</label>
                    <input
                      type="text"
                      value={manualForm.modell}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, modell: e.target.value })
                      }
                      placeholder="z.B. 320i"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Motorcode:</label>
                  <input
                    type="text"
                    value={manualForm.motorcode}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        motorcode: e.target.value,
                      })
                    }
                    placeholder="z.B. N20B20"
                    className="w-full p-2.5 bg-gray-900 border border-blue-500 rounded-xl text-white font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">
                      Leistung (kW):
                    </label>
                    <input
                      type="text"
                      value={manualForm.kw}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, kw: e.target.value })
                      }
                      placeholder="z.B. 135 kW"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">
                      Hubraum (ccm):
                    </label>
                    <input
                      type="text"
                      value={manualForm.hubraum}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          hubraum: e.target.value,
                        })
                      }
                      placeholder="z.B. 1997"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">HSN/TSN:</label>
                    <input
                      type="text"
                      value={manualForm.hsn_tsn}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          hsn_tsn: e.target.value,
                        })
                      }
                      placeholder="z.B. 0005/ABC"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">
                      Baujahr / EZ:
                    </label>
                    <input
                      type="text"
                      value={manualForm.baujahr}
                      onChange={(e) =>
                        setManualForm({
                          ...manualForm,
                          baujahr: e.target.value,
                        })
                      }
                      placeholder="z.B. 05.2014"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">
                    Fahrgestellnummer (VIN):
                  </label>
                  <input
                    type="text"
                    value={manualForm.vin}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, vin: e.target.value })
                    }
                    placeholder="z.B. WBA3A57... "
                    className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-xs"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-bold shadow transition-all text-xs"
                  >
                    💾 Fahrzeug anlegen
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManualOpen(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl font-bold shadow transition-all text-xs"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {duplicateModal.isOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 border border-yellow-600/50 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
              <div className="text-4xl mb-1">⚠️</div>
              <h2 className="text-xl font-bold text-white">
                Fahrzeug bereits vorhanden!
              </h2>
              <p className="text-xs text-gray-300">
                Das Kennzeichen{' '}
                <b className="text-blue-400">
                  {duplicateModal.newScanData?.kennzeichen}
                </b>{' '}
                ist bereits im System gespeichert (Halter:{' '}
                {duplicateModal.existingVehicle?.name}). Was möchtest du tun?
              </p>

              <div className="space-y-2.5 pt-2">
                <button
                  onClick={() => handleDuplicateAction('merge')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow"
                >
                  📁 Zu bestehender Akte hinzufügen (Seiten anhängen)
                </button>
                <button
                  onClick={() => handleDuplicateAction('overwrite')}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow"
                >
                  🔄 Stammdaten überschreiben (Historie behalten)
                </button>
                <button
                  onClick={() => handleDuplicateAction('new')}
                  className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow"
                >
                  ➕ Als neues, separates Fahrzeug anlegen
                </button>
              </div>
            </div>
          </div>
        )}

        {isSettingsOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsSettingsOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">
                  ⚙️ Einstellungen & Sicherheit
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-300 font-semibold mb-1 block">
                    App-PIN ändern:
                  </label>
                  <input
                    type="text"
                    maxLength="6"
                    value={tempPin}
                    onChange={(e) => setTempPin(e.target.value)}
                    className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Neue PIN eingeben..."
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-300 font-semibold mb-1 block">
                    Gemini API Key:
                  </label>
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Gib hier deinen API-Key ein..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveSettings}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold shadow transition-all"
                >
                  Speichern
                </button>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl font-bold shadow transition-all"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}

        {isHistoryOpen && selectedVehicle && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsHistoryOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-700 pb-3 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    📋 Werkstatt-Historie
                  </h2>
                  <p className="text-xs text-gray-400">
                    Fahrzeug: {selectedVehicle.kennzeichen} (
                    {selectedVehicle.hersteller} {selectedVehicle.modell})
                  </p>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1 text-lg"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleAddHistoryEntry}
                className="bg-gray-900 p-3 rounded-xl border border-gray-700 space-y-3 shrink-0"
              >
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  Neuen Eintrag erfassen
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">
                      Kategorie:
                    </label>
                    <select
                      value={historyForm.kategorie}
                      onChange={(e) =>
                        setHistoryForm({
                          ...historyForm,
                          kategorie: e.target.value,
                        })
                      }
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    >
                      <option value="Reparatur">Reparatur</option>
                      <option value="Kundendienst">Kundendienst</option>
                      <option value="Fehlersuche">Fehlersuche</option>
                      <option value="TÜV / AU">TÜV / AU</option>
                      <option value="Sonstiges">Sonstiges</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Datum:</label>
                    <input
                      type="date"
                      value={historyForm.datum}
                      onChange={(e) =>
                        setHistoryForm({
                          ...historyForm,
                          datum: e.target.value,
                        })
                      }
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">
                    Beschreibung der Arbeiten / Diagnose:
                  </label>
                  <textarea
                    rows="2"
                    value={historyForm.beschreibung}
                    onChange={(e) =>
                      setHistoryForm({
                        ...historyForm,
                        beschreibung: e.target.value,
                      })
                    }
                    placeholder="z.B. Steuerkette erneuert, Fehlerspeicher ausgelesen..."
                    className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">
                    Teilenummern (optional):
                  </label>
                  <input
                    type="text"
                    value={historyForm.teilenummern}
                    onChange={(e) =>
                      setHistoryForm({
                        ...historyForm,
                        teilenummern: e.target.value,
                      })
                    }
                    placeholder="z.B. 11317584723, 11-31-7-567-680"
                    className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg font-bold text-xs transition-all shadow"
                >
                  + Eintrag zur Historie hinzufügen
                </button>
              </form>

              <div className="overflow-y-auto flex-grow space-y-2 pr-1">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Bisherige Einträge ({selectedVehicle.historie?.length || 0}):
                </h3>

                {selectedVehicle.historie &&
                selectedVehicle.historie.length > 0 ? (
                  selectedVehicle.historie.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-gray-900 p-3 rounded-xl border border-gray-700 relative group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              entry.kategorie === 'Reparatur'
                                ? 'bg-red-900/60 text-red-300 border border-red-700'
                                : entry.kategorie === 'Kundendienst'
                                ? 'bg-green-900/60 text-green-300 border border-green-700'
                                : entry.kategorie === 'Fehlersuche'
                                ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-700'
                                : 'bg-blue-900/60 text-blue-300 border border-blue-700'
                            }`}
                          >
                            {entry.kategorie}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">
                            {entry.datum}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteHistoryEntry(entry.id)}
                          className="text-gray-500 hover:text-red-400 text-xs p-1 transition-colors"
                          title="Eintrag löschen"
                        >
                          🗑️
                        </button>
                      </div>

                      <p className="text-sm text-gray-200 mt-1 whitespace-pre-wrap">
                        {entry.beschreibung}
                      </p>

                      {entry.teilenummern && (
                        <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-blue-400 font-mono flex items-center gap-1">
                          <span>📦 Teile:</span> {entry.teilenummern}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 text-xs py-8">
                    Noch keine Historien-Einträge für dieses Fahrzeug vorhanden.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isDocsOpen && selectedVehicle && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setIsDocsOpen(false)}
          >
            <div
              className="bg-gray-800 border border-gray-700 rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center border-b border-gray-700 pb-3 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    📎 Dokumente & Dateien
                  </h2>
                  <p className="text-xs text-gray-400">
                    Fahrzeug: {selectedVehicle.kennzeichen}
                  </p>
                </div>
                <button
                  onClick={() => setIsDocsOpen(false)}
                  className="text-gray-400 hover:text-white font-bold px-2 py-1 text-lg"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleAddDocument}
                className="bg-gray-900 p-3 rounded-xl border border-gray-700 space-y-3 shrink-0"
              >
                <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  Dokument / Datei hinzufügen
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">
                      Bereich / Kategorie:
                    </label>
                    <select
                      value={docForm.kategorie}
                      onChange={(e) =>
                        setDocForm({ ...docForm, kategorie: e.target.value })
                      }
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    >
                      <option value="Rechnungen">Rechnungen & Belege</option>
                      <option value="ABEs">ABEs & Gutachten</option>
                      <option value="Fehlerspeicher">
                        Fehlerspeicherprotokoll
                      </option>
                      <option value="Sonstige">Sonstige Informationen</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Datum:</label>
                    <input
                      type="date"
                      value={docForm.datum}
                      onChange={(e) =>
                        setDocForm({ ...docForm, datum: e.target.value })
                      }
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">
                    Titel / Bezeichnung:
                  </label>
                  <input
                    type="text"
                    value={docForm.titel}
                    onChange={(e) =>
                      setDocForm({ ...docForm, titel: e.target.value })
                    }
                    placeholder="z.B. Rechnung Inspektion 2026, ABE Felgen..."
                    className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-gray-400">
                    Datei hochladen (Foto / PDF / Scan):
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleDocFileSelect}
                    className="w-full p-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-teal-600 file:text-white hover:file:bg-teal-700 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-lg font-bold text-xs transition-all shadow"
                >
                  + Dokument speichern
                </button>
              </form>

              <div className="overflow-y-auto flex-grow space-y-3 pr-1">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Hinterlegte Dokumente (
                  {selectedVehicle.dokumente?.length || 0}):
                </h3>

                {selectedVehicle.dokumente &&
                selectedVehicle.dokumente.length > 0 ? (
                  ['Rechnungen', 'ABEs', 'Fehlerspeicher', 'Sonstige'].map(
                    (kat) => {
                      const docsInCat = selectedVehicle.dokumente.filter(
                        (d) => d.kategorie === kat
                      );
                      if (docsInCat.length === 0) return null;

                      return (
                        <div key={kat} className="space-y-1.5">
                          <h4 className="text-[11px] font-bold text-teal-300 bg-teal-950/40 px-2 py-1 rounded border border-teal-900/50">
                            {kat === 'Rechnungen'
                              ? '📄 Rechnungen & Belege'
                              : kat === 'ABEs'
                              ? '📜 ABEs & Gutachten'
                              : kat === 'Fehlerspeicher'
                              ? '🔍 Fehlerspeicherprotokolle'
                              : '📁 Sonstige Informationen'}{' '}
                            ({docsInCat.length})
                          </h4>

                          {docsInCat.map((doc) => (
                            <div
                              key={doc.id}
                              className="bg-gray-900 p-2.5 rounded-xl border border-gray-700 flex justify-between items-center"
                            >
                              <div className="pr-2">
                                <span className="text-xs font-bold text-white block">
                                  {doc.titel}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {doc.datum}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {doc.dateiData && (
                                  <button
                                    onClick={() => openDocumentInNewTab(doc)}
                                    className="text-xs bg-gray-800 hover:bg-gray-700 text-teal-400 px-2.5 py-1 rounded border border-gray-600 font-medium"
                                  >
                                    👁️ Öffnen
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  className="text-gray-500 hover:text-red-400 text-xs p-1"
                                  title="Dokument löschen"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                  )
                ) : (
                  <p className="text-center text-gray-500 text-xs py-8">
                    Noch keine Dokumente oder Dateien für dieses Fahrzeug
                    hinterlegt.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isModalOpen &&
          selectedVehicle &&
          selectedVehicle.bilder &&
          selectedVehicle.bilder[activeImageIndex] && (
            <div
              className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            >
              <div className="relative max-w-4xl w-full flex flex-col items-center">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="absolute -top-12 right-0 bg-gray-800 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-lg border border-gray-600 shadow-lg transition-all z-10"
                >
                  ✕ Schließen
                </button>

                <img
                  src={selectedVehicle.bilder[activeImageIndex]}
                  alt="Fahrzeugschein Großansicht"
                  className="max-h-[85vh] w-auto rounded-xl border-2 border-gray-700 shadow-2xl object-contain"
                  onClick={(e) => e.stopPropagation()}
                />

                <div className="flex items-center gap-4 mt-4">
                  <span className="text-gray-300 text-sm font-medium">
                    Seite {activeImageIndex + 1} von{' '}
                    {selectedVehicle.bilder.length}
                  </span>
                  {selectedVehicle.bilder.length > 1 && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex((prev) =>
                            prev > 0
                              ? prev - 1
                              : selectedVehicle.bilder.length - 1
                          );
                        }}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 text-xs font-bold"
                      >
                        ← Vorherige Seite
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex((prev) =>
                            prev < selectedVehicle.bilder.length - 1
                              ? prev + 1
                              : 0
                          );
                        }}
                        className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 text-xs font-bold"
                      >
                        Nächste Seite →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
