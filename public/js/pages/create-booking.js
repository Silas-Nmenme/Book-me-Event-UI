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
    const prevLabel = btnCreate.textContent;
    btnCreate.textContent = 'Creating…';
    try {
      // basic validation
      const evDate = document.getElementById('eventDate').value;
      const evLoc = document.getElementById('eventLocation').value?.trim();
      const tot = Number(document.getElementById('totalAmount').value) || 0;

      if (!loadedRequest) {
        throw new Error('Request not loaded — cannot create booking.');
      }
      if ((loadedRequest.status || '').toString().toUpperCase() !== 'ACCEPTED') {
        throw new Error('Request must be accepted before creating a booking.');
      }
      if (!evDate) throw new Error('Event date is required');
      if (!evLoc) throw new Error('Event location is required');
      if (!tot || tot <= 0) throw new Error('Enter a valid total amount');

      const payload = {
        request: requestId,
        // Backend will use request.service when available, but some requests may not be populated.
        // Send service whenever we can reliably derive an id.
        ...(loadedRequest?.service
          ? {
              service:
                typeof loadedRequest.service === 'string'
                  ? loadedRequest.service
                  : loadedRequest.service._id,
            }
          : {}),
        eventDate: evDate,
        eventLocation: evLoc,
        totalAmount: tot,
        amountCurrency: loadedRequest?.budgetCurrency || 'NGN',
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
      const msg = err?.data?.message || err?.message || 'Try again';
      toast({ title: 'Create booking failed', message: msg, variant: 'danger' });
    } finally {
      btnCreate.removeAttribute('disabled');
      btnCreate.textContent = prevLabel;
    }
  });
}
