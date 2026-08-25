import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PrescriptionForm } from '../components/prescription/PrescriptionForm'
import { usePrescriptionStore } from '../lib/store/prescription-store'
import type { ExamResult } from '../lib/types/prescription'

interface LocationState {
  examResult?: { OD: ExamResult; OS: ExamResult }
}

export function PrescriptionEntry() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [toast, setToast] = useState(false)
  const navigatingRef = useRef(false)

  // If the exam passed results via location.state, record them in the store
  // so PrescriptionForm picks them up as initial values.
  useEffect(() => {
    const state = location.state as LocationState | null
    if (!state?.examResult) return
    const store = usePrescriptionStore.getState()
    store.setExamResult('OD', state.examResult.OD)
    store.setExamResult('OS', state.examResult.OS)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for a prescription save and navigate home afterwards.
  useEffect(() => {
    const snapshot = usePrescriptionStore.getState().prescription

    const unsub = usePrescriptionStore.subscribe(
      (s) => s.prescription,
      (next) => {
        if (next && next !== snapshot && !navigatingRef.current) {
          navigatingRef.current = true
          setToast(true)
          setTimeout(() => {
            navigate('/')
          }, 1500)
        }
      },
    )

    return unsub
  }, [navigate])

  return (
    <div className="relative flex h-full min-h-0">
      <PrescriptionForm />

      {/* Save confirmation toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-card border border-border-default bg-bg-elevated shadow-lg"
          role="status"
        >
          <span
            className="inline-block rounded-full flex-shrink-0"
            style={{
              width: 7,
              height: 7,
              background: '#34D399',
              boxShadow: '0 0 6px rgba(52,211,153,0.6)',
            }}
          />
          <span className="text-[14px] text-text-primary whitespace-nowrap">
            Prescription saved to your computer ✓
          </span>
        </div>
      )}
    </div>
  )
}

export default PrescriptionEntry
