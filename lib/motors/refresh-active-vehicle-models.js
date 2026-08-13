import { refreshActiveVehicleModels } from '../active-vehicle-models.js';

export async function run() {
  return {
    tables: ['active_vehicle_models', 'active_vehicle_models_history'],
    ...(await refreshActiveVehicleModels()),
  };
}
