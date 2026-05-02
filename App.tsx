import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal,
  ActivityIndicator, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

const Tab = createBottomTabNavigator();

// ─── COLORS ───────────────────────────────────────────────
const C = {
  bg: '#0a0a0f', surface: '#13131c', card: '#1a1a28',
  border: '#2a2a40', accent: '#6c63ff', accent2: '#ff6584',
  accent3: '#43e97b', text: '#e8e8f0', muted: '#7070a0',
};

// ─── ALL TOOLS ────────────────────────────────────────────
const TOOLS = [
  { id: 'pdf-word', icon: '📄', label: 'PDF → Word', from: 'PDF', to: 'DOCX', color: '#ff6584', bg: 'rgba(255,101,132,0.15)', desc: 'Convert PDF to editable Word document', mvp: true },
  { id: 'word-pdf', icon: '📝', label: 'Word → PDF', from: 'DOCX', to: 'PDF', color: '#6c63ff', bg: 'rgba(108,99,255,0.15)', desc: 'Convert Word document to PDF' },
  { id: 'img-pdf', icon: '🖼️', label: 'Image → PDF', from: 'JPG/PNG', to: 'PDF', color: '#43e97b', bg: 'rgba(67,233,123,0.15)', desc: 'Convert images to PDF with OCR' },
  { id: 'excel-pdf', icon: '📊', label: 'Excel → PDF', from: 'XLSX', to: 'PDF', color: '#ffb347', bg: 'rgba(255,179,71,0.15)', desc: 'Convert Excel sheets to PDF' },
  { id: 'ppt-pdf', icon: '📑', label: 'PPT → PDF', from: 'PPTX', to: 'PDF', color: '#ff6b6b', bg: 'rgba(255,107,107,0.15)', desc: 'Convert PowerPoint slides to PDF' },
  { id: 'pdf-txt', icon: '🔤', label: 'PDF → Text', from: 'PDF', to: 'TXT', color: '#4ecdc4', bg: 'rgba(78,205,196,0.15)', desc: 'Extract all text from PDF' },
  { id: 'compress', icon: '🗜️', label: 'Compress PDF', from: 'PDF', to: 'PDF', color: '#55efc4', bg: 'rgba(85,239,196,0.15)', desc: 'Reduce PDF file size' },
  { id: 'merge', icon: '🔗', label: 'Merge PDFs', from: 'PDF', to: 'PDF', color: '#fd79a8', bg: 'rgba(253,121,168,0.15)', desc: 'Combine multiple PDFs' },
  { id: 'split', icon: '✂️', label: 'Split PDF', from: 'PDF', to: 'PDF', color: '#ffeaa7', bg: 'rgba(255,234,167,0.15)', desc: 'Split PDF into multiple files' },
  { id: 'protect', icon: '🔒', label: 'Protect PDF', from: 'PDF', to: 'PDF', color: '#74b9ff', bg: 'rgba(116,185,255,0.15)', desc: 'Add password to PDF' },
  { id: 'sign', icon: '✍️', label: 'Sign PDF', from: 'PDF', to: 'PDF', color: '#a29bfe', bg: 'rgba(162,155,254,0.15)', desc: 'Add digital signature' },
  { id: 'html-pdf', icon: '🌐', label: 'HTML → PDF', from: 'HTML', to: 'PDF', color: '#a8edea', bg: 'rgba(168,237,234,0.15)', desc: 'Convert web page to PDF' },
];

const RECENT_FILES = [
  { icon: '📕', name: 'Annual_Report.pdf', meta: 'PDF→DOCX · 2.4MB · 2h ago', bg: 'rgba(255,101,132,0.15)' },
  { icon: '📘', name: 'Contract_Final.docx', meta: 'DOCX→PDF · 890KB · Yesterday', bg: 'rgba(108,99,255,0.15)' },
  { icon: '🖼️', name: 'Scanned_Invoice.jpg', meta: 'JPG→PDF · 1.1MB · 3 days ago', bg: 'rgba(67,233,123,0.15)' },
];

// ─── REUSABLE COMPONENTS ──────────────────────────────────

function PressBtn({ onPress, style, children, disabled }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[style, disabled && { opacity: 0.5 }]}
      activeOpacity={0.65}
    >
      {children}
    </TouchableOpacity>
  );
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.8}
      style={[s.toggle, value && s.toggleOn]}
    >
      <View style={[s.toggleDot, value && s.toggleDotOn]} />
    </TouchableOpacity>
  );
}

// ─── HOME SCREEN ──────────────────────────────────────────
function HomeScreen({ navigation }: any) {
  const mvpTool = TOOLS[0];
  const quickTools = TOOLS.slice(0, 6);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* HEADER */}
        <View style={s.header}>
          <View>
            <Text style={s.logo}>RakDocs</Text>
            <Text style={s.logoSub}>AI PDF CONVERTER</Text>
          </View>
          <PressBtn
            style={s.iconBtn}
            onPress={() => Alert.alert('RakDocs', 'Version 1.0.0\nAI-powered PDF Converter')}
          >
            <Text style={{ fontSize: 20 }}>ℹ️</Text>
          </PressBtn>
        </View>

        {/* AI AGENT BAR */}
        <View style={s.agentBar}>
          <View style={s.agentAvatar}><Text style={{ fontSize: 20 }}>🤖</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.agentLabel}>AI AGENT ACTIVE</Text>
            <Text style={s.agentMsg}>Ready to convert! PDF → Word is our most popular tool.</Text>
          </View>
        </View>

        {/* STATS */}
        <View style={s.statsRow}>
          {[
            { icon: '📄', val: '47', lbl: 'Converted' },
            { icon: '💾', val: '128MB', lbl: 'Saved' },
            { icon: '🔄', val: '12', lbl: 'Formats' },
          ].map((st, i) => (
            <View key={i} style={s.statCard}>
              <Text style={{ fontSize: 20 }}>{st.icon}</Text>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLbl}>{st.lbl}</Text>
            </View>
          ))}
        </View>

        {/* MVP TOOL - PDF TO WORD */}
        <Text style={s.sectionTitle}>⭐ Most Popular</Text>
        <PressBtn
          style={s.mvpCard}
          onPress={() => navigation.navigate('Convert', { toolId: 'pdf-word' })}
        >
          <View style={[s.mvpIcon, { backgroundColor: mvpTool.bg }]}>
            <Text style={{ fontSize: 32 }}>{mvpTool.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={s.mvpTitle}>{mvpTool.label}</Text>
              <View style={s.mvpBadge}><Text style={s.mvpBadgeText}>MVP</Text></View>
            </View>
            <Text style={s.mvpDesc}>{mvpTool.desc}</Text>
            <Text style={s.mvpAction}>Tap to convert →</Text>
          </View>
        </PressBtn>

        {/* QUICK TOOLS */}
        <Text style={s.sectionTitle}>Quick Convert</Text>
        <View style={s.toolsGrid}>
          {quickTools.map((tool) => (
            <PressBtn
              key={tool.id}
              style={s.toolCard}
              onPress={() => navigation.navigate('Convert', { toolId: tool.id })}
            >
              <View style={[s.toolIcon, { backgroundColor: tool.bg }]}>
                <Text style={{ fontSize: 22 }}>{tool.icon}</Text>
              </View>
              <Text style={[s.toolLabel, { color: tool.color }]}>{tool.label}</Text>
            </PressBtn>
          ))}
        </View>

        {/* RECENT FILES */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recent Files</Text>
          <PressBtn onPress={() => navigation.navigate('Files')}>
            <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>See All</Text>
          </PressBtn>
        </View>
        {RECENT_FILES.map((file, i) => (
          <PressBtn
            key={i}
            style={s.fileRow}
            onPress={() => Alert.alert('File Options', file.name, [
              { text: 'Download', onPress: () => Alert.alert('✅', 'Saved to Downloads!') },
              { text: 'Share', onPress: () => Alert.alert('📤', 'Opening share sheet...') },
              { text: 'Delete', style: 'destructive' },
              { text: 'Cancel', style: 'cancel' },
            ])}
          >
            <View style={[s.fileIcon, { backgroundColor: file.bg }]}>
              <Text style={{ fontSize: 20 }}>{file.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fileName}>{file.name}</Text>
              <Text style={s.fileMeta}>{file.meta}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 18 }}>›</Text>
          </PressBtn>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── CONVERTER SCREEN ─────────────────────────────────────
function ConverterScreen({ route }: any) {
  const toolId = route?.params?.toolId || 'pdf-word';
  const [selectedTool, setSelectedTool] = useState(TOOLS.find(t => t.id === toolId) || TOOLS[0]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [compress, setCompress] = useState(true);
  const [ocr, setOcr] = useState(false);
  const [protect, setProtect] = useState(false);
  const [converted, setConverted] = useState(false);

  const STEPS = [
    'Initializing AI engine...',
    'Reading document structure...',
    'Applying layout & margins...',
    'Processing content...',
    'Optimizing output...',
    '✅ Conversion complete!',
  ];

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile(result.assets[0]);
        setConverted(false);
        Alert.alert('✅ File Selected!', result.assets[0].name);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  };

  // ─── CONFIG ───────────────────────────────────────────────
  const BACKEND_URL = 'https://rakdocs-backend.onrender.com';

  const FORMAT_MIME: Record<string, string> = {
    'pdf-word':  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'word-pdf':  'application/pdf',
    'img-pdf':   'application/pdf',
    'excel-pdf': 'application/pdf',
    'ppt-pdf':   'application/pdf',
    'pdf-txt':   'text/plain',
    'compress':  'application/pdf',
    'merge':     'application/pdf',
    'split':     'application/zip',
    'protect':   'application/pdf',
    'sign':      'application/pdf',
    'html-pdf':  'application/pdf',
  };

  const [convertedFilePath, setConvertedFilePath] = useState<string | null>(null);
  const [serverReady, setServerReady]             = useState(false);

  // ── Ping server on mount so it wakes up BEFORE user hits Convert ──
  React.useEffect(() => {
    const wake = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) setServerReady(true);
      } catch (_) {}
    };
    wake();
    // Keep server warm — ping every 10 min to prevent sleep
    const iv = setInterval(wake, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const getOutputFileName = () => {
    if (!selectedFile) return `converted.${selectedTool.to.toLowerCase()}`;
    const base = (selectedFile.name || 'file').replace(/\.[^.]+$/, '');
    return `${base}_converted.${selectedTool.to.toLowerCase()}`;
  };

  const startConversion = async () => {
    if (!selectedFile) {
      Alert.alert('⚠️ No File Selected', 'Please select a file first.');
      return;
    }

    setConverting(true);
    setProgress(5);
    setConverted(false);
    setConvertedFilePath(null);

    // If server not warmed up yet, ping it and wait
    if (!serverReady) {
      setProgressStep('Waking up server...');
      try {
        await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(30000) });
        setServerReady(true);
      } catch (_) {}
    }

    setProgressStep('Uploading file...');
    setProgress(10);

    try {
      const outputFileName = getOutputFileName();
      const outputPath = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + outputFileName;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 35);
            setProgress(10 + pct);
            setProgressStep(`Uploading... ${Math.round((e.loaded / e.total) * 100)}%`);
          }
        };

        xhr.onload = async () => {
          try {
            if (xhr.status === 429) {
              reject(new Error('Too many conversions. Please wait an hour and try again.'));
              return;
            }
            if (xhr.status !== 200) {
              let msg = 'Server error';
              try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch (_) {}
              reject(new Error(msg));
              return;
            }

            setProgress(65);
            setProgressStep('Converting — preserving layout & fonts...');

            const blob  = xhr.response;
            const reader = new FileReader();

            reader.onloadend = async () => {
              try {
                setProgress(88);
                setProgressStep('Saving to device...');
                const base64 = (reader.result as string).split(',')[1];
                await FileSystem.writeAsStringAsync(outputPath, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                setProgress(100);
                setProgressStep('✅ Done!');
                setConvertedFilePath(outputPath);
                setTimeout(() => { setConverting(false); setConverted(true); }, 400);
                resolve();
              } catch (e: any) { reject(e); }
            };
            reader.onerror = () => reject(new Error('Failed to read server response.'));
            reader.readAsDataURL(blob);
          } catch (e: any) { reject(e); }
        };

        xhr.onerror   = () => reject(new Error('Network error. Check your internet connection.'));
        xhr.ontimeout = () => reject(new Error('Timed out. Try a smaller file or check your connection.'));

        const fd = new FormData();
        fd.append('toolId', selectedTool.id);
        fd.append('file', { uri: selectedFile.uri, type: selectedFile.mimeType || 'application/octet-stream', name: selectedFile.name || 'upload' } as any);

        xhr.open('POST', `${BACKEND_URL}/convert`);
        xhr.responseType = 'blob';
        xhr.timeout = 5 * 60 * 1000;
        xhr.send(fd);
      });

    } catch (err: any) {
      setConverting(false);
      setProgress(0);
      setProgressStep('');
      Alert.alert('❌ Conversion Failed', err?.message || 'Something went wrong. Please try again.');
    }
  };

  const downloadResult = async () => {
    if (!convertedFilePath) {
      Alert.alert('No File', 'Please convert a file first.');
      return;
    }
    try {
      const info = await FileSystem.getInfoAsync(convertedFilePath);
      if (!info.exists) { Alert.alert('File Not Found', 'Please convert again.'); return; }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(convertedFilePath, {
          dialogTitle: `Save ${getOutputFileName()}`,
          mimeType: FORMAT_MIME[selectedTool.id] || 'application/octet-stream',
          UTI: selectedTool.to === 'PDF' ? 'com.adobe.pdf'
            : selectedTool.to === 'DOCX' ? 'org.openxmlformats.wordprocessingml.document'
            : 'public.data',
        });
      } else {
        Alert.alert('✅ File Saved', `"${getOutputFileName()}" is ready.`);
      }
    } catch (err: any) {
      Alert.alert('Download Failed', err?.message || 'Could not open file.');
    }
  };


  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={s.screenTitle}>Convert File</Text>

        {/* SELECTED TOOL */}
        <PressBtn style={s.toolSelectCard} onPress={() => setShowToolPicker(true)}>
          <View style={[s.toolSelectIcon, { backgroundColor: selectedTool.bg }]}>
            <Text style={{ fontSize: 26 }}>{selectedTool.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.toolSelectLabel}>{selectedTool.label}</Text>
            <Text style={s.toolSelectDesc}>{selectedTool.desc}</Text>
          </View>
          <View style={s.changeBtn}>
            <Text style={s.changeBtnText}>Change</Text>
          </View>
        </PressBtn>

        {/* FORMAT FLOW */}
        <View style={s.formatFlow}>
          <View style={[s.formatPill, { backgroundColor: 'rgba(108,99,255,0.15)' }]}>
            <Text style={[s.formatPillText, { color: C.accent }]}>{selectedTool.from}</Text>
          </View>
          <Text style={{ color: C.muted, fontSize: 20, fontWeight: '700' }}>→</Text>
          <View style={[s.formatPill, { backgroundColor: 'rgba(255,101,132,0.15)' }]}>
            <Text style={[s.formatPillText, { color: C.accent2 }]}>{selectedTool.to}</Text>
          </View>
        </View>

        {/* FILE UPLOAD */}
        <PressBtn style={[s.uploadZone, selectedFile && s.uploadZoneActive]} onPress={pickFile}>
          {selectedFile ? (
            <>
              <Text style={{ fontSize: 36 }}>📄</Text>
              <Text style={s.uploadFileName}>{selectedFile.name}</Text>
              <Text style={s.uploadFileMeta}>
                {selectedFile.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'File ready'} · Tap to change
              </Text>
              <View style={s.fileReadyBadge}>
                <Text style={s.fileReadyText}>✓ FILE LOADED</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 44 }}>☁️</Text>
              <Text style={s.uploadTitle}>Tap to Select File</Text>
              <Text style={s.uploadSub}>PDF, DOCX, XLSX, PPT, JPG, PNG supported</Text>
              <View style={s.uploadHint}>
                <Text style={s.uploadHintText}>👆 TAP HERE</Text>
              </View>
            </>
          )}
        </PressBtn>

        {/* SETTINGS */}
        <Text style={[s.sectionTitle, { marginTop: 4 }]}>⚙️ Conversion Settings</Text>
        <View style={s.settingsCard}>
          <View style={s.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Compress Output</Text>
              <Text style={s.settingSubLabel}>Reduce final file size</Text>
            </View>
            <Toggle value={compress} onToggle={() => setCompress(!compress)} />
          </View>
          <View style={s.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>OCR (Scan to Text)</Text>
              <Text style={s.settingSubLabel}>Extract text from scanned docs</Text>
            </View>
            <Toggle value={ocr} onToggle={() => setOcr(!ocr)} />
          </View>
          <View style={[s.settingRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Password Protect</Text>
              <Text style={s.settingSubLabel}>Encrypt output file</Text>
            </View>
            <Toggle value={protect} onToggle={() => setProtect(!protect)} />
          </View>
        </View>

        {/* MARGINS */}
        <Text style={s.sectionTitle}>📏 Margins (mm)</Text>
        <View style={s.settingsCard}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 14 }}>
            {[
              { label: 'TOP', val: '20' },
              { label: 'BOTTOM', val: '20' },
              { label: 'LEFT', val: '25' },
              { label: 'RIGHT', val: '25' },
            ].map((m, i) => (
              <View key={i} style={{ width: '45%' }}>
                <Text style={s.marginLabel}>{m.label}</Text>
                <PressBtn
                  style={s.marginInput}
                  onPress={() => Alert.alert('Set Margin', `Set ${m.label} margin value (mm)`)}
                >
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 15 }}>{m.val}</Text>
                </PressBtn>
              </View>
            ))}
          </View>
        </View>

        {/* PROGRESS */}
        {converting && (
          <View style={s.progressCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>Converting...</Text>
              <Text style={{ color: C.accent, fontWeight: '900', fontSize: 16 }}>{progress}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>{progressStep}</Text>
            <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} />
          </View>
        )}

        {/* SUCCESS */}
        {converted && (
          <PressBtn style={s.successCard} onPress={downloadResult}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.successTitle}>Conversion Complete!</Text>
              <Text style={s.successSub}>Tap to download your file</Text>
            </View>
            <Text style={{ fontSize: 24 }}>⬇️</Text>
          </PressBtn>
        )}

        {/* CONVERT BUTTON */}
        <PressBtn
          style={[s.convertBtn, converting && { opacity: 0.7 }]}
          onPress={startConversion}
          disabled={converting}
        >
          <Text style={s.convertBtnText}>
            {converting ? '⏳  Converting...' : '⚡  Convert Now'}
          </Text>
        </PressBtn>

      </ScrollView>

      {/* TOOL PICKER MODAL */}
      <Modal visible={showToolPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Select Conversion</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {TOOLS.map((tool) => (
                <PressBtn
                  key={tool.id}
                  style={[s.modalToolRow, selectedTool.id === tool.id && s.modalToolRowActive]}
                  onPress={() => { setSelectedTool(tool); setShowToolPicker(false); setSelectedFile(null); setConverted(false); }}
                >
                  <View style={[s.toolIcon, { backgroundColor: tool.bg }]}>
                    <Text style={{ fontSize: 22 }}>{tool.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalToolLabel, selectedTool.id === tool.id && { color: C.accent }]}>{tool.label}</Text>
                    <Text style={s.modalToolDesc}>{tool.desc}</Text>
                  </View>
                  {selectedTool.id === tool.id && <Text style={{ color: C.accent, fontSize: 18 }}>✓</Text>}
                </PressBtn>
              ))}
            </ScrollView>
            <PressBtn style={s.modalCloseBtn} onPress={() => setShowToolPicker(false)}>
              <Text style={s.modalCloseBtnText}>Close</Text>
            </PressBtn>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── TOOLS SCREEN ─────────────────────────────────────────
function ToolsScreen({ navigation }: any) {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={s.screenTitle}>All Tools</Text>
        <Text style={[s.agentMsg, { marginBottom: 16, color: C.muted }]}>12 conversion tools available</Text>
        <View style={s.toolsGrid}>
          {TOOLS.map((tool) => (
            <PressBtn
              key={tool.id}
              style={s.toolCardLarge}
              onPress={() => navigation.navigate('Convert', { toolId: tool.id })}
            >
              <View style={[s.toolIconLarge, { backgroundColor: tool.bg }]}>
                <Text style={{ fontSize: 28 }}>{tool.icon}</Text>
              </View>
              <Text style={[s.toolLargeLabel, { color: tool.color }]}>{tool.label}</Text>
              <Text style={s.toolLargeDesc} numberOfLines={2}>{tool.desc}</Text>
              <View style={s.toolFromTo}>
                <Text style={[s.fmtText, { color: C.accent }]}>{tool.from}</Text>
                <Text style={{ color: C.muted, fontSize: 10 }}>→</Text>
                <Text style={[s.fmtText, { color: C.accent2 }]}>{tool.to}</Text>
              </View>
            </PressBtn>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── FILES SCREEN ─────────────────────────────────────────
function FilesScreen() {
  const [files, setFiles] = useState(RECENT_FILES);

  const deleteFile = (i: number) => {
    Alert.alert('Delete File', 'Remove this file?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setFiles(prev => prev.filter((_, idx) => idx !== i)) },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={s.screenTitle}>My Files</Text>
        <View style={s.statsRow}>
          {[
            { val: `${files.length}`, lbl: 'Total Files' },
            { val: '128MB', lbl: 'Total Size' },
            { val: '100%', lbl: 'Success' },
          ].map((st, i) => (
            <View key={i} style={s.statCard}>
              <Text style={s.statVal}>{st.val}</Text>
              <Text style={s.statLbl}>{st.lbl}</Text>
            </View>
          ))}
        </View>

        {files.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Text style={{ fontSize: 48 }}>📂</Text>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>No files yet</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>Converted files will appear here</Text>
          </View>
        ) : (
          files.map((file, i) => (
            <View key={i} style={s.fileRowFull}>
              <View style={[s.fileIcon, { backgroundColor: file.bg }]}>
                <Text style={{ fontSize: 20 }}>{file.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fileName}>{file.name}</Text>
                <Text style={s.fileMeta}>{file.meta}</Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <View style={s.successBadge}><Text style={s.successText}>✓ success</Text></View>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <PressBtn style={s.actionBtn} onPress={() => Alert.alert('⬇️', 'Saved to Downloads!')}>
                  <Text style={{ fontSize: 14 }}>⬇️</Text>
                </PressBtn>
                <PressBtn style={s.actionBtn} onPress={() => Alert.alert('📤', 'Share sheet opened')}>
                  <Text style={{ fontSize: 14 }}>📤</Text>
                </PressBtn>
                <PressBtn style={s.actionBtn} onPress={() => deleteFile(i)}>
                  <Text style={{ fontSize: 14 }}>🗑️</Text>
                </PressBtn>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── SETTINGS SCREEN ──────────────────────────────────────
function SettingsScreen() {
  const [notif, setNotif] = useState(true);
  const [dark, setDark] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [cloud, setCloud] = useState(false);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={s.screenTitle}>Settings</Text>

        <Text style={s.settingSectionLabel}>APP PREFERENCES</Text>
        <View style={s.settingsCard}>
          {[
            { icon: '🌙', label: 'Dark Mode', sub: 'App appearance', val: dark, set: setDark },
            { icon: '🔔', label: 'Notifications', sub: 'Conversion alerts', val: notif, set: setNotif },
            { icon: '💾', label: 'Auto Save', sub: 'Save to Downloads', val: autoSave, set: setAutoSave },
            { icon: '☁️', label: 'Cloud Backup', sub: 'Backup to Google Drive', val: cloud, set: setCloud },
          ].map((row, i, arr) => (
            <View key={i} style={[s.settingRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={{ fontSize: 20, marginRight: 12 }}>{row.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>{row.label}</Text>
                <Text style={s.settingSubLabel}>{row.sub}</Text>
              </View>
              <Toggle value={row.val} onToggle={() => row.set(!row.val)} />
            </View>
          ))}
        </View>

        <Text style={s.settingSectionLabel}>ABOUT</Text>
        <View style={s.settingsCard}>
          {[
            { icon: '⭐', label: 'Rate on Play Store', sub: 'Support us with 5 stars' },
            { icon: '📤', label: 'Share App', sub: 'Recommend to friends' },
            { icon: '🐛', label: 'Report Bug', sub: 'Help us improve' },
            { icon: '📜', label: 'Privacy Policy', sub: 'How we handle your data' },
          ].map((item, i, arr) => (
            <PressBtn
              key={i}
              style={[s.settingRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => Alert.alert(item.label, item.sub)}
            >
              <Text style={{ fontSize: 20, marginRight: 12 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>{item.label}</Text>
                <Text style={s.settingSubLabel}>{item.sub}</Text>
              </View>
              <Text style={{ color: C.muted, fontSize: 22 }}>›</Text>
            </PressBtn>
          ))}
        </View>

        <View style={{ alignItems: 'center', paddingTop: 24 }}>
          <Text style={{ color: C.muted, fontSize: 14, fontWeight: '700' }}>DocShift v1.0.0</Text>
          <Text style={{ color: C.border, fontSize: 11, marginTop: 4 }}>AI PDF Converter · Made with ❤️</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: s.tabBar,
              tabBarActiveTintColor: C.accent,
              tabBarInactiveTintColor: C.muted,
              tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
            }}
          >
            <Tab.Screen name="Home" component={HomeScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🏠</Text> }} />
            <Tab.Screen name="Convert" component={ConverterScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🔄</Text> }} />
            <Tab.Screen name="Tools" component={ToolsScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>🛠️</Text> }} />
            <Tab.Screen name="Files" component={FilesScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>📁</Text> }} />
            <Tab.Screen name="Settings" component={SettingsScreen}
              options={{ tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>⚙️</Text> }} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── STYLES ───────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  logo: { fontSize: 28, fontWeight: '900', color: C.accent },
  logoSub: { fontSize: 10, color: C.muted, letterSpacing: 2, fontWeight: '600' },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  agentBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12, borderLeftWidth: 3, borderLeftColor: C.accent },
  agentAvatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  agentLabel: { fontSize: 10, color: C.accent, fontWeight: '700', letterSpacing: 1.5 },
  agentMsg: { fontSize: 13, color: C.text, lineHeight: 18 },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, gap: 8 },
  statCard: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 16, fontWeight: '900', color: C.accent },
  statLbl: { fontSize: 10, color: C.muted, fontWeight: '600' },
  sectionTitle: { fontSize: 12, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginHorizontal: 20, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 20 },
  mvpCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 16, marginBottom: 16, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.accent2, borderRadius: 16, padding: 16 },
  mvpIcon: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mvpTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  mvpDesc: { fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 17 },
  mvpAction: { fontSize: 12, color: C.accent, fontWeight: '700', marginTop: 6 },
  mvpBadge: { backgroundColor: C.accent2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mvpBadgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  toolCard: { width: '30%', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 12, alignItems: 'center', gap: 6 },
  toolIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  toolCardLarge: { width: '47%', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, gap: 8 },
  toolIconLarge: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  toolLargeLabel: { fontSize: 13, fontWeight: '800' },
  toolLargeDesc: { fontSize: 11, color: C.muted, lineHeight: 15 },
  toolFromTo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fmtText: { fontSize: 10, fontWeight: '800' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  fileRowFull: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 8 },
  fileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fileName: { fontSize: 13, fontWeight: '700', color: C.text },
  fileMeta: { fontSize: 11, color: C.muted, marginTop: 2 },
  successBadge: { backgroundColor: 'rgba(67,233,123,0.1)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  successText: { fontSize: 9, color: C.accent3, fontWeight: '800' },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontSize: 26, fontWeight: '900', color: C.text, marginBottom: 16 },
  toolSelectCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  toolSelectIcon: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toolSelectLabel: { fontSize: 15, fontWeight: '800', color: C.text },
  toolSelectDesc: { fontSize: 11, color: C.muted, marginTop: 2 },
  changeBtn: { backgroundColor: 'rgba(108,99,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  changeBtnText: { fontSize: 12, color: C.accent, fontWeight: '700' },
  formatFlow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 },
  formatPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  formatPillText: { fontSize: 14, fontWeight: '900' },
  uploadZone: { borderWidth: 2, borderStyle: 'dashed', borderColor: C.border, borderRadius: 16, padding: 32, alignItems: 'center', marginBottom: 16, backgroundColor: 'rgba(108,99,255,0.03)', gap: 6 },
  uploadZoneActive: { borderColor: C.accent3, backgroundColor: 'rgba(67,233,123,0.05)' },
  uploadTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  uploadSub: { fontSize: 12, color: C.muted, textAlign: 'center' },
  uploadHint: { backgroundColor: 'rgba(108,99,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 6 },
  uploadHintText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  uploadFileName: { fontSize: 15, fontWeight: '700', color: C.text },
  uploadFileMeta: { fontSize: 12, color: C.muted },
  fileReadyBadge: { backgroundColor: 'rgba(67,233,123,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  fileReadyText: { color: C.accent3, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  settingsCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(42,42,64,0.5)' },
  settingLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  settingSubLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
  settingSectionLabel: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
  toggle: { width: 48, height: 26, backgroundColor: C.border, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn: { backgroundColor: C.accent },
  toggleDot: { width: 20, height: 20, backgroundColor: '#fff', borderRadius: 10, elevation: 2 },
  toggleDotOn: { transform: [{ translateX: 22 }] },
  marginLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  marginInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12 },
  progressCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 14 },
  progressTrack: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.accent, borderRadius: 4 },
  successCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(67,233,123,0.1)', borderWidth: 1.5, borderColor: C.accent3, borderRadius: 16, padding: 16, marginBottom: 14 },
  successTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  successSub: { fontSize: 12, color: C.accent3, marginTop: 2 },
  convertBtn: { backgroundColor: C.accent, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 8, elevation: 4 },
  convertBtnText: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  tabBar: { backgroundColor: 'rgba(19,19,28,0.97)', borderTopColor: C.border, borderTopWidth: 1, height: 64, paddingBottom: 8, paddingTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.card, borderRadius: 24, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20, maxHeight: '80%' },
  modalHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.text, marginBottom: 14 },
  modalToolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, marginBottom: 6, backgroundColor: C.surface },
  modalToolRowActive: { backgroundColor: 'rgba(108,99,255,0.12)', borderWidth: 1, borderColor: C.accent },
  modalToolLabel: { fontSize: 14, fontWeight: '700', color: C.text },
  modalToolDesc: { fontSize: 11, color: C.muted, marginTop: 2 },
  modalCloseBtn: { backgroundColor: C.accent, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 10 },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
