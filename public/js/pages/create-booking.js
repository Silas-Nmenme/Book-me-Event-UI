import { getRequest, createBooking, createPayment } from '../api.js';
import { toast } from '../ui.js';

function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

export async function initCreateBookingPage() {
  const requestId = qs('requestId');
  const requestSummary = document.getElementById('requestSummary');
  const form = document.getElementById('createBookingForm');
  const btnCreate = document.getElementById('btnCreateBooking');
  const confirmation = document.getElementById('confirmation');
  const confirmationText = document.getElementById('confirmationText');
  const btnRecordPayment = document.getElementById('btnRecordPayment');

  if (!form) return;

  let loadedRequest = null;
  if (requestId) {
    try {
      const res = await getRequest(requestId);
      loadedRequest = res?.data || res;
      requestSummary.innerHTML = `<div class="card p-2"><strong>Request:</strong> ${loadedRequest._id || loadedRequest.id} • <small class="text-muted">${loadedRequest?.service?.name || loadedRequest?.service?.serviceName || ''}</small></div>`;
      const tot = loadedRequest.totalAmount || loadedRequest?.service?.price || '';
      const eventDateEl = document.getElementById('eventDate');
      const eventLocationEl = document.getElementById('eventLocation');
      const totalAmountEl = document.getElementById('totalAmount');
      if (loadedRequest.eventDate) eventDateEl.value = new Date(loadedRequest.eventDate).toISOString().slice(0,10);
      if (loadedRequest.eventLocation) eventLocationEl.value = loadedRequest.eventLocation;
      if (tot) totalAmountEl.value = tot;
    } catch (err) {
      toast({ title: 'Request not found', message: err?.message || '', variant: 'danger' });
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnCreate.setAttribute('disabled', 'disabled');
    try {
      const payload = {
        request: requestId,
        service: loadedRequest?.service?._id || loadedRequest?.service,
        eventDate: document.getElementById('eventDate').value,
        eventLocation: document.getElementById('eventLocation').value,
        totalAmount: Number(document.getElementById('totalAmount').value) || 0,
        specialRequests: document.getElementById('specialRequests').value || '',
      };

      const bookingRes = await createBooking(payload);
      const booking = bookingRes?.data || bookingRes;
      confirmationText.textContent = `Booking ${booking._id || booking.id} created successfully.`;
      confirmation.classList.remove('d-none');
      form.classList.add('d-none');

      // attach record payment handler
      btnRecordPayment.addEventListener('click', async () => {
        try {
          toast({ title: 'Processing', message: 'Recording payment...', variant: 'info' });
          await createPayment({ booking: booking._id || booking.id, paymentMethod: 'OFFLINE', transactionReference: 'OFFLINE-' + Date.now(), paymentGateway: 'MANUAL' });
          toast({ title: 'Payment', message: 'Payment recorded.', variant: 'success' });
          setTimeout(() => { window.location.href = 'bookings.html'; }, 600);
        } catch (err) {
          toast({ title: 'Payment failed', message: err?.message || 'Try again.', variant: 'danger' });
        }
      });

    } catch (err) {
      toast({ title: 'Create booking failed', message: err?.message || 'Try again', variant: 'danger' });
    } finally {
      btnCreate.removeAttribute('disabled');
    }
  });
}
